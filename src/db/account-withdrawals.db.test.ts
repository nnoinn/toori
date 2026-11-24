// 회원 탈퇴 DB 구조 (마이그레이션 0023, #154, 11/23 nnoinn 승인). 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// - 고객·원장님 계정: 한 로그인에 탈퇴하지 않은 계정은 하나, 탈퇴한 뒤에는 같은 로그인으로 새 계정(가입 저장 함수로)
// - 30일 뒤 지우는 칸: 원장님 휴대폰·사업자등록증은 탈퇴한 것만, 계좌번호와 예금주는 같이
// - 샵 탈퇴 상태, 매물·시간대 마감 사유 account_withdrawal, 탈퇴로 없어진 쿠폰은 안 쓴 것만
// - account_withdrawals: 계정 종류에 맞는 하나만, 원장님은 되돌릴 샵 상태, 끝나지 않은 줄은 계정마다 하나
// - 로그인 정보(auth.users)를 지워도 profiles 줄은 남는다((가))

import { eq } from 'drizzle-orm';
import { authUsers } from 'drizzle-orm/supabase';
import { afterAll, expect, it } from 'vitest';

import {
  accountWithdrawals,
  coupons,
  customers,
  owners,
  payoutAccounts,
  profiles,
  shops,
  slots,
  slotWindows,
} from '@/db/schema';
import {
  type NewOwnerAccount,
  saveCustomerAccount,
  saveOwnerAccount,
} from '@/server/auth/account-store';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  createTestUser,
  TEST_LOCATION,
  testSlot,
} from '../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../tests/db/test-db';

/** savepoint 안에서 돌려 막혔으면 제약 이름이 든 오류 문구, 통과했으면 null. 바깥 트랜잭션은 계속 쓸 수 있다 */
async function blockedMessage(tx: TestTx, run: (t: TestTx) => Promise<unknown>) {
  try {
    await tx.transaction(async (t) => {
      await run(t);
    });
    return null;
  } catch (error) {
    const cause = (error as { cause?: unknown }).cause ?? error;
    const { message, constraint_name: constraint } = cause as {
      message?: string;
      constraint_name?: string;
    };
    return `${constraint ?? ''} ${message ?? String(cause)}`;
  }
}

const AT = new Date('2026-11-23T10:00:00+09:00');

function newCustomer(userId: string) {
  return { userId, name: '김고객', nickname: '고객', phone: '010-0000-0000', optionalTerms: [] };
}

function newOwner(userId: string): NewOwnerAccount {
  return {
    userId,
    owner: { name: '김원장', phone: '010-0000-0000' },
    shop: {
      name: '투리헤어 중앙점',
      category: 'hair',
      phone: '031-000-0000',
      roadAddress: '경기 안산시 단원구 테스트로 1',
      jibunAddress: null,
      addressDetail: null,
      sido: '경기',
      sigungu: '안산시 단원구',
      sigunguCode: '41273',
      location: TEST_LOCATION,
      businessName: '투리헤어',
      representativeName: '김원장',
      businessRegistrationNumber: '0000000000',
      openedOn: '2025-03-01',
      businessDocPath: `users/${userId}/doc.jpg`,
    },
    payout: {
      bankCode: '088',
      accountNumberEncrypted: 'v1:iv:tag:cipher',
      accountLast4: '6789',
      accountHolder: '김원장',
    },
  };
}

async function ownerIdOf(tx: TestTx, shopId: string): Promise<string> {
  const [row] = await tx.select({ ownerId: shops.ownerId }).from(shops).where(eq(shops.id, shopId));
  return row.ownerId;
}

describeDb('회원 탈퇴 DB 구조 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('탈퇴하지 않은 고객·원장님 계정은 한 로그인에 하나이고, 탈퇴한 뒤에는 같은 로그인으로 새 계정을 만들 수 있다', async () => {
    await withRollback(async (tx) => {
      const userId = await createTestUser(tx);

      const first = await saveCustomerAccount(tx, newCustomer(userId));
      expect(first).not.toBeNull();
      // 이미 있으면 가입 저장은 아무것도 하지 않는다
      expect(await saveCustomerAccount(tx, newCustomer(userId))).toBeNull();
      expect(
        await blockedMessage(tx, (t) =>
          t.insert(customers).values({ userId, name: '김고객', nickname: '고객' }),
        ),
      ).toContain('customers_user_id_active_unique');

      await tx
        .update(customers)
        .set({ withdrawnAt: AT })
        .where(eq(customers.id, first!.customerId));
      const again = await saveCustomerAccount(tx, newCustomer(userId));
      expect(again?.customerId).toBeTruthy();
      expect(again?.customerId).not.toBe(first?.customerId);
      expect(await saveCustomerAccount(tx, newCustomer(userId))).toBeNull();

      const owner = await saveOwnerAccount(tx, newOwner(userId));
      expect(owner).not.toBeNull();
      expect(await saveOwnerAccount(tx, newOwner(userId))).toBeNull();
      await tx.update(owners).set({ withdrawnAt: AT }).where(eq(owners.id, owner!.ownerId));
      await tx.update(shops).set({ status: 'withdrawn' }).where(eq(shops.id, owner!.shopId));
      const newOwnerAccount = await saveOwnerAccount(tx, newOwner(userId));
      expect(newOwnerAccount?.ownerId).toBeTruthy();
      expect(newOwnerAccount?.ownerId).not.toBe(owner?.ownerId);
    });
  });

  it('원장님 휴대폰·사업자등록증은 탈퇴한 것만 비울 수 있고, 계좌번호와 예금주는 같이 비운다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const ownerId = await ownerIdOf(tx, shop.shopId);
      await tx.insert(payoutAccounts).values({
        shopId: shop.shopId,
        bankCode: '088',
        accountNumberEncrypted: 'v1:iv:tag:cipher',
        accountLast4: '6789',
        accountHolder: '김원장',
      });

      expect(
        await blockedMessage(tx, (t) =>
          t.update(owners).set({ phone: null }).where(eq(owners.id, ownerId)),
        ),
      ).toContain('owners_phone_check');
      expect(
        await blockedMessage(tx, (t) =>
          t.update(shops).set({ businessDocPath: null }).where(eq(shops.id, shop.shopId)),
        ),
      ).toContain('shops_business_doc_path_check');
      expect(
        await blockedMessage(tx, (t) =>
          t
            .update(payoutAccounts)
            .set({ accountNumberEncrypted: null })
            .where(eq(payoutAccounts.shopId, shop.shopId)),
        ),
      ).toContain('payout_accounts_erased_check');

      // 탈퇴하고 30일이 지나 지울 때
      await tx
        .update(owners)
        .set({ withdrawnAt: AT, phone: null, name: '탈퇴한 회원' })
        .where(eq(owners.id, ownerId));
      await tx
        .update(shops)
        .set({ status: 'withdrawn', businessDocPath: null })
        .where(eq(shops.id, shop.shopId));
      await tx
        .update(payoutAccounts)
        .set({ accountNumberEncrypted: null, accountHolder: null })
        .where(eq(payoutAccounts.shopId, shop.shopId));
      const [account] = await tx
        .select()
        .from(payoutAccounts)
        .where(eq(payoutAccounts.shopId, shop.shopId));
      // 은행과 뒷자리는 정산 기록으로 남긴다
      expect(account).toMatchObject({ bankCode: '088', accountLast4: '6789' });
      expect(
        await blockedMessage(tx, (t) =>
          t.update(shops).set({ status: 'closed' }).where(eq(shops.id, shop.shopId)),
        ),
      ).toContain('shops_status_check');
    });
  });

  it('매물·시간대 매물 마감 사유에 계정 탈퇴로 일괄 마감(account_withdrawal)이 있다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const [slot] = await tx
        .insert(slots)
        .values(
          testSlot(shop, '09:00', '10:00', {
            status: 'closed',
            closeReason: 'account_withdrawal',
            closedAt: AT,
          }),
        )
        .returning({ closeReason: slots.closeReason });
      expect(slot.closeReason).toBe('account_withdrawal');
      const [window] = await tx
        .insert(slotWindows)
        .values({
          shopId: shop.shopId,
          startAt: new Date('2026-11-01T13:00:00+09:00'),
          endAt: new Date('2026-11-01T15:00:00+09:00'),
          publishAt: new Date('2026-10-30T13:00:00+09:00'),
          status: 'closed',
          closeReason: 'account_withdrawal',
          closedAt: AT,
          createdBy: shop.createdBy,
        })
        .returning({ closeReason: slotWindows.closeReason });
      expect(window.closeReason).toBe('account_withdrawal');
    });
  });

  it('탈퇴로 없앨 수 있는 쿠폰은 안 쓴 쿠폰뿐이다', async () => {
    await withRollback(async (tx) => {
      const customer = await createTestCustomer(tx);
      const shop = await createTestShop(tx, { status: 'approved' });
      const { order } = await createTestReservation(
        tx,
        shop,
        customer.customerId,
        '09:00',
        '10:00',
        'confirmed',
      );
      const [unused, used] = await tx
        .insert(coupons)
        .values([
          {
            customerId: customer.customerId,
            amount: 3000,
            reason: 'owner_fault_compensation',
            issuedAt: AT,
            expiresAt: AT,
          },
          {
            customerId: customer.customerId,
            amount: 3000,
            reason: 'owner_fault_compensation',
            issuedAt: AT,
            expiresAt: AT,
            usedOrderId: order.id,
            usedAt: AT,
          },
        ])
        .returning({ id: coupons.id });

      expect(
        await blockedMessage(tx, (t) =>
          t.update(coupons).set({ forfeitedAt: AT }).where(eq(coupons.id, unused.id)),
        ),
      ).toBeNull();
      expect(
        await blockedMessage(tx, (t) =>
          t.update(coupons).set({ forfeitedAt: AT }).where(eq(coupons.id, used.id)),
        ),
      ).toContain('coupons_forfeited_check');
    });
  });

  it('탈퇴 기록: 계정 종류에 맞는 하나만, 원장님은 되돌릴 샵 상태(탈퇴 말고), 끝나지 않은 줄은 계정마다 하나', async () => {
    await withRollback(async (tx) => {
      const customer = await createTestCustomer(tx);
      const shop = await createTestShop(tx, { status: 'approved' });
      const ownerId = await ownerIdOf(tx, shop.shopId);
      const asCustomer = {
        userId: customer.userId,
        accountType: 'customer',
        customerId: customer.customerId,
        withdrawnAt: AT,
      };
      const asOwner = {
        userId: shop.createdBy,
        accountType: 'owner',
        ownerId,
        withdrawnAt: AT,
        shopStatusBefore: 'approved',
      };

      const [first] = await tx
        .insert(accountWithdrawals)
        .values(asCustomer)
        .returning({ id: accountWithdrawals.id });
      expect(
        await blockedMessage(tx, (t) => t.insert(accountWithdrawals).values(asOwner)),
      ).toBeNull();

      // 끝나지 않은 줄은 계정마다 하나
      expect(
        await blockedMessage(tx, (t) => t.insert(accountWithdrawals).values(asCustomer)),
      ).toContain('account_withdrawals_open_customer_unique');
      expect(
        await blockedMessage(tx, (t) => t.insert(accountWithdrawals).values(asOwner)),
      ).toContain('account_withdrawals_open_owner_unique');
      // 되살리면 그 줄은 끝나서 다시 탈퇴할 수 있다
      await tx
        .update(accountWithdrawals)
        .set({ restoredAt: AT })
        .where(eq(accountWithdrawals.id, first.id));
      expect(
        await blockedMessage(tx, (t) => t.insert(accountWithdrawals).values(asCustomer)),
      ).toBeNull();
      // 되살린 줄은 지우지 않는다
      expect(
        await blockedMessage(tx, (t) =>
          t
            .update(accountWithdrawals)
            .set({ erasedAt: AT })
            .where(eq(accountWithdrawals.id, first.id)),
        ),
      ).toContain('account_withdrawals_end_check');

      // 계정 종류와 맞지 않는 칸
      for (const wrong of [
        { ...asCustomer, ownerId },
        { ...asCustomer, shopStatusBefore: 'approved' },
        { ...asCustomer, accountType: 'owner' },
        { ...asOwner, shopStatusBefore: null },
        { ...asOwner, customerId: customer.customerId },
      ]) {
        expect(
          await blockedMessage(tx, (t) => t.insert(accountWithdrawals).values(wrong)),
        ).toContain('account_withdrawals_account_check');
      }
      expect(
        await blockedMessage(tx, (t) =>
          t.insert(accountWithdrawals).values({ ...asOwner, shopStatusBefore: 'withdrawn' }),
        ),
      ).toContain('account_withdrawals_shop_status_before_check');
      expect(
        await blockedMessage(tx, (t) =>
          t.insert(accountWithdrawals).values({ ...asCustomer, forfeitedCouponCount: -1 }),
        ),
      ).toContain('account_withdrawals_count_check');
    });
  });

  it('로그인 정보(auth.users)를 지워도 profiles 줄은 남고, 이메일을 비우고 같은 사람 표시를 남길 수 있다((가))', async () => {
    await withRollback(async (tx) => {
      const customer = await createTestCustomer(tx);
      await tx
        .update(profiles)
        .set({ email: null, identityHash: 'hmac-sha256-hex' })
        .where(eq(profiles.id, customer.userId));
      await tx.delete(authUsers).where(eq(authUsers.id, customer.userId));

      const [profile] = await tx.select().from(profiles).where(eq(profiles.id, customer.userId));
      expect(profile).toMatchObject({ email: null, identityHash: 'hmac-sha256-hex' });
      const [account] = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.userId, customer.userId));
      expect(account.id).toBe(customer.customerId);
    });
  });
});
