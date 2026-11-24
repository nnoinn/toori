// 탈퇴한 계정 되살리기 저장과 조회(#154 본문 3장, 0023)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 함수를 부르는 차례(잠그기 → 기한 보기 → 되살리기 → 계정 모드)는 withdrawal.test.ts가 본다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { accountWithdrawals, coupons, customers, owners, shops, slots } from '@/db/schema';

import { createTestCustomer, createTestShop, testSlot } from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import {
  hasActiveAccount,
  hasRestorableWithdrawal,
  lockOpenWithdrawal,
  readOpenWithdrawal,
  restoreCustomerAccount,
  restoreOwnerAccount,
} from './withdrawal-restore-store';

const NOW = new Date('2026-11-24T12:00:00+09:00');
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

/** 탈퇴한 고객 계정과 탈퇴 기록 */
async function withdrawnCustomer(tx: TestTx, withdrawnAt: Date) {
  const customer = await createTestCustomer(tx);
  await tx.update(customers).set({ withdrawnAt }).where(eq(customers.id, customer.customerId));
  const [row] = await tx
    .insert(accountWithdrawals)
    .values({
      userId: customer.userId,
      accountType: 'customer',
      customerId: customer.customerId,
      withdrawnAt,
    })
    .returning({ id: accountWithdrawals.id });
  return { ...customer, withdrawalId: row.id };
}

describeDb('탈퇴한 계정 되살리기 저장 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('끝나지 않은 탈퇴 기록 중 가장 최근 것만 읽고, 되살린 기록·다른 계정 종류·다른 사람 것은 읽지 않는다', async () => {
    await withRollback(async (tx) => {
      const first = await withdrawnCustomer(tx, daysAgo(40));
      // 30일이 지나 같은 로그인으로 새 계정을 만들었다가 다시 탈퇴
      const [second] = await tx
        .insert(customers)
        .values({ userId: first.userId, name: '김고객', nickname: '고객', withdrawnAt: daysAgo(3) })
        .returning({ id: customers.id });
      const [latest] = await tx
        .insert(accountWithdrawals)
        .values({
          userId: first.userId,
          accountType: 'customer',
          customerId: second.id,
          withdrawnAt: daysAgo(3),
        })
        .returning({ id: accountWithdrawals.id });
      const other = await withdrawnCustomer(tx, daysAgo(1));
      const input = { userId: first.userId, accountType: 'customer' } as const;

      const expected = {
        id: latest.id,
        withdrawnAt: daysAgo(3),
        customerId: second.id,
        ownerId: null,
        shopStatusBefore: null,
      };
      expect(await readOpenWithdrawal(tx, input)).toEqual(expected);
      expect(await lockOpenWithdrawal(tx, input)).toEqual(expected);
      expect(await readOpenWithdrawal(tx, { ...input, accountType: 'owner' })).toBeNull();

      await tx
        .update(accountWithdrawals)
        .set({ restoredAt: NOW })
        .where(eq(accountWithdrawals.id, latest.id));
      expect((await readOpenWithdrawal(tx, input))?.id).toBe(first.withdrawalId);
      expect((await readOpenWithdrawal(tx, { ...input, userId: other.userId }))?.id).toBe(
        other.withdrawalId,
      );
    });
  });

  it('되살리기 기간(30일) 안의 끝나지 않은 탈퇴 기록이 있을 때만 새 가입을 막는다', async () => {
    await withRollback(async (tx) => {
      const recent = await withdrawnCustomer(tx, new Date(daysAgo(30).getTime() + 1000));
      const expired = await withdrawnCustomer(tx, daysAgo(30));
      const restored = await withdrawnCustomer(tx, daysAgo(2));
      await tx
        .update(accountWithdrawals)
        .set({ restoredAt: daysAgo(1) })
        .where(eq(accountWithdrawals.id, restored.withdrawalId));
      const check = (userId: string, accountType: 'customer' | 'owner' = 'customer') =>
        hasRestorableWithdrawal(tx, { userId, accountType, now: NOW });

      expect(await check(recent.userId)).toBe(true);
      expect(await check(recent.userId, 'owner')).toBe(false);
      // 딱 30일이 되는 시각부터는 새로 가입할 수 있다
      expect(await check(expired.userId)).toBe(false);
      expect(await check(restored.userId)).toBe(false);
    });
  });

  it('고객: 탈퇴 표시를 지우고 기록을 끝낸다. 없어진 쿠폰은 그대로다', async () => {
    await withRollback(async (tx) => {
      const customer = await withdrawnCustomer(tx, daysAgo(3));
      const [coupon] = await tx
        .insert(coupons)
        .values({
          customerId: customer.customerId,
          amount: 3000,
          reason: 'owner_fault_compensation',
          issuedAt: daysAgo(10),
          expiresAt: daysAgo(-80),
          forfeitedAt: daysAgo(3),
        })
        .returning({ id: coupons.id });
      const input = { userId: customer.userId, accountType: 'customer' } as const;
      expect(await hasActiveAccount(tx, input)).toBe(false);

      await restoreCustomerAccount(tx, {
        withdrawalId: customer.withdrawalId,
        customerId: customer.customerId,
        now: NOW,
      });

      expect(await hasActiveAccount(tx, input)).toBe(true);
      expect(await hasActiveAccount(tx, { ...input, accountType: 'owner' })).toBe(false);
      const [withdrawal] = await tx
        .select()
        .from(accountWithdrawals)
        .where(eq(accountWithdrawals.id, customer.withdrawalId));
      expect(withdrawal.restoredAt).toEqual(NOW);
      expect(await readOpenWithdrawal(tx, input)).toBeNull();
      const [couponRow] = await tx.select().from(coupons).where(eq(coupons.id, coupon.id));
      expect(couponRow.forfeitedAt).toEqual(daysAgo(3));
    });
  });

  it('원장님: 샵을 탈퇴 전 상태(승인 대기)로 돌리고 기록을 끝낸다. 일괄 마감한 매물은 그대로다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'withdrawn' });
      const [{ ownerId }] = await tx
        .select({ ownerId: shops.ownerId })
        .from(shops)
        .where(eq(shops.id, shop.shopId));
      await tx
        .update(owners)
        .set({ withdrawnAt: daysAgo(3) })
        .where(eq(owners.id, ownerId));
      const [closed] = await tx
        .insert(slots)
        .values(
          testSlot(shop, '10:00', '11:00', {
            status: 'closed',
            closeReason: 'account_withdrawal',
            closedAt: daysAgo(3),
          }),
        )
        .returning({ id: slots.id });
      const [withdrawal] = await tx
        .insert(accountWithdrawals)
        .values({
          userId: shop.createdBy,
          accountType: 'owner',
          ownerId,
          withdrawnAt: daysAgo(3),
          shopStatusBefore: 'pending',
        })
        .returning({ id: accountWithdrawals.id });

      await restoreOwnerAccount(tx, {
        withdrawalId: withdrawal.id,
        ownerId,
        shopStatusBefore: 'pending',
        now: NOW,
      });

      const [shopRow] = await tx.select().from(shops).where(eq(shops.id, shop.shopId));
      expect(shopRow.status).toBe('pending');
      expect(await hasActiveAccount(tx, { userId: shop.createdBy, accountType: 'owner' })).toBe(
        true,
      );
      const [slotRow] = await tx.select().from(slots).where(eq(slots.id, closed.id));
      expect(slotRow).toMatchObject({ status: 'closed', closeReason: 'account_withdrawal' });
      expect(
        await readOpenWithdrawal(tx, { userId: shop.createdBy, accountType: 'owner' }),
      ).toBeNull();
    });
  });
});
