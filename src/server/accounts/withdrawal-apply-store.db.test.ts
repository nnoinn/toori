// 회원 탈퇴 처리 저장(#154 본문 2장, 0023)을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 함수를 부르는 차례(잠그기 → 막는 이유 다시 세기 → 처리 → 로그아웃)는 withdrawal.test.ts가 본다.
// 시각은 2026-11-01 한국 시간이다(tests/db/fixtures.ts testSlot과 같은 날)

import { and, eq, or } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import {
  accountWithdrawals,
  coupons,
  customers,
  favorites,
  interestAreas,
  owners,
  profiles,
  pushSubscriptions,
  shops,
  slotInterests,
  slots,
  slotWindows,
  termsAgreements,
} from '@/db/schema';
import { acquireHold } from '@/server/payments/hold-store';
import { acquireWindowHold } from '@/server/slot-windows/hold-store';
import { insertSlotWindows } from '@/server/slot-windows/store';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  type TestShop,
  testSlot,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import {
  applyCustomerWithdrawal,
  applyOwnerWithdrawal,
  closeShopOpenSlots,
  fillIdentityHash,
  lockActiveCustomer,
  lockActiveOwnerShop,
} from './withdrawal-apply-store';

const at = (hm: string) => new Date(`2026-11-01T${hm}:00+09:00`);
const NOW = at('09:00');
const MINUTE = 60 * 1000;
const later = (minutes: number) => new Date(NOW.getTime() + minutes * MINUTE);

async function ownerIdOf(tx: TestTx, shopId: string) {
  const [row] = await tx.select({ ownerId: shops.ownerId }).from(shops).where(eq(shops.id, shopId));
  return row.ownerId;
}

async function insertSlot(tx: TestTx, shop: TestShop, start: string, end: string, extra = {}) {
  const [row] = await tx
    .insert(slots)
    .values(testSlot(shop, start, end, extra))
    .returning({ id: slots.id });
  return row.id;
}

async function slotRow(tx: TestTx, slotId: string) {
  const [row] = await tx.select().from(slots).where(eq(slots.id, slotId));
  return row;
}

/** 16:00~19:00 게시중 시간대(샵의 커트) */
async function addWindow(tx: TestTx, shop: TestShop) {
  const [window] = await insertSlotWindows(tx, {
    shopId: shop.shopId,
    createdBy: shop.createdBy,
    newCustomerOnly: false,
    windows: [
      {
        start: at('16:00'),
        end: at('19:00'),
        publishAt: new Date('2026-10-30T10:00:00+09:00'),
        status: 'published',
      },
    ],
    menus: [
      {
        menuId: shop.menuId,
        serviceType: 'cut',
        menuName: '커트',
        menuDescription: null,
        listPrice: 20_000,
        durationMinutes: 60,
        discountRate: 30,
        salePrice: 14_000,
      },
    ],
  });
  return window.id;
}

function pushOf(userId: string, accountType: 'customer' | 'owner') {
  return {
    userId,
    accountType,
    endpoint: `https://push.example/${userId}`,
    p256dh: 'p',
    auth: 'a',
  };
}

describeDb('회원 탈퇴 처리 저장 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('고객: 홀딩을 풀고, 기한이 남은 안 쓴 쿠폰만 없애고, 관심 동네·관심 샵·관심 매물·고객 푸시 구독을 지우고, 광고성 동의만 철회로 남긴다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const customer = await createTestCustomer(tx);
      const { customerId, userId } = customer;
      const heldSlot = await insertSlot(tx, shop, '10:00', '11:00', {
        holdCustomerId: customerId,
        holdExpiresAt: later(5),
      });
      const { order } = await createTestReservation(
        tx,
        shop,
        customerId,
        '12:00',
        '13:00',
        'completed',
      );
      const coupon = (extra: Partial<typeof coupons.$inferInsert>) => ({
        customerId,
        amount: 3000,
        reason: 'owner_fault_compensation',
        issuedAt: at('08:00'),
        expiresAt: later(60 * 24),
        ...extra,
      });
      const [valid, expired, used] = await tx
        .insert(coupons)
        .values([
          coupon({}),
          coupon({ expiresAt: at('08:30') }),
          coupon({ usedOrderId: order.id, usedAt: at('08:10') }),
        ])
        .returning({ id: coupons.id });
      await tx.insert(interestAreas).values({ customerId, sigunguCode: '41273' });
      await tx.insert(favorites).values({ customerId, shopId: shop.shopId });
      // 관심 매물(C-211)은 한 시술 매물과 시간대 모두 지우고, 다른 고객의 관심은 그대로다
      const windowId = await addWindow(tx, shop);
      const other = await createTestCustomer(tx);
      await tx.insert(slotInterests).values([
        { customerId, slotId: heldSlot },
        { customerId, windowId },
        { customerId: other.customerId, slotId: heldSlot },
      ]);
      await tx
        .insert(pushSubscriptions)
        .values([pushOf(userId, 'customer'), pushOf(userId, 'owner')]);
      await tx.insert(termsAgreements).values(
        (['service', 'marketing', 'interest_alert'] as const).map((termsType) => ({
          userId,
          accountType: 'customer',
          termsType,
          version: 'test',
        })),
      );
      // 같은 로그인의 원장님 계정 쪽 동의는 그대로다
      await tx
        .insert(termsAgreements)
        .values({ userId, accountType: 'owner', termsType: 'supplier', version: 'test' });

      expect(await lockActiveCustomer(tx, customerId)).toEqual({
        userId,
        email: `${userId}@test.invalid`,
      });
      expect(await applyCustomerWithdrawal(tx, { customerId, userId, now: NOW })).toEqual({
        forfeitedCouponCount: 1,
      });

      expect(await slotRow(tx, heldSlot)).toMatchObject({
        holdCustomerId: null,
        holdExpiresAt: null,
      });
      const couponRows = await tx
        .select({ id: coupons.id, forfeitedAt: coupons.forfeitedAt })
        .from(coupons)
        .where(eq(coupons.customerId, customerId));
      expect(new Map(couponRows.map((row) => [row.id, row.forfeitedAt]))).toEqual(
        new Map([
          [valid.id, NOW],
          [expired.id, null],
          [used.id, null],
        ]),
      );
      expect(
        await tx.select().from(interestAreas).where(eq(interestAreas.customerId, customerId)),
      ).toEqual([]);
      expect(await tx.select().from(favorites).where(eq(favorites.customerId, customerId))).toEqual(
        [],
      );
      expect(
        await tx
          .select({ customerId: slotInterests.customerId })
          .from(slotInterests)
          .where(or(eq(slotInterests.slotId, heldSlot), eq(slotInterests.windowId, windowId))),
      ).toEqual([{ customerId: other.customerId }]);
      expect(
        (
          await tx
            .select({ accountType: pushSubscriptions.accountType })
            .from(pushSubscriptions)
            .where(eq(pushSubscriptions.userId, userId))
        ).map((row) => row.accountType),
      ).toEqual(['owner']);
      const terms = await tx
        .select({
          accountType: termsAgreements.accountType,
          termsType: termsAgreements.termsType,
          withdrawnAt: termsAgreements.withdrawnAt,
        })
        .from(termsAgreements)
        .where(eq(termsAgreements.userId, userId));
      expect(terms).toEqual(
        expect.arrayContaining([
          { accountType: 'customer', termsType: 'service', withdrawnAt: null },
          { accountType: 'customer', termsType: 'marketing', withdrawnAt: NOW },
          { accountType: 'customer', termsType: 'interest_alert', withdrawnAt: NOW },
          { accountType: 'owner', termsType: 'supplier', withdrawnAt: null },
        ]),
      );

      const [account] = await tx.select().from(customers).where(eq(customers.id, customerId));
      expect(account.withdrawnAt).toEqual(NOW);
      expect(
        await tx.select().from(accountWithdrawals).where(eq(accountWithdrawals.userId, userId)),
      ).toEqual([
        expect.objectContaining({
          accountType: 'customer',
          customerId,
          ownerId: null,
          withdrawnAt: NOW,
          restoredAt: null,
          erasedAt: null,
          shopStatusBefore: null,
          forfeitedCouponCount: 1,
          closedSlotCount: 0,
        }),
      ]);
      // 이미 탈퇴했으면 잠글 계정이 없다(동시에 두 번 눌러도 한 번만 처리된다)
      expect(await lockActiveCustomer(tx, customerId)).toBeNull();
    });
  });

  it('원장님: 판매 전이고 결제 중이 아닌 매물과 시간대만 일괄 마감하고, 결제 없이 끝난 시간대 칸을 정리한다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const other = await createTestCustomer(tx);
      const open = await insertSlot(tx, shop, '10:00', '11:00');
      const notYet = await insertSlot(tx, shop, '11:00', '12:00', {
        status: 'scheduled',
        publishAt: later(60),
      });
      const held = await insertSlot(tx, shop, '12:00', '13:00', {
        holdCustomerId: other.customerId,
        holdExpiresAt: later(5),
      });
      const { slot: reserved } = await createTestReservation(
        tx,
        shop,
        other.customerId,
        '14:00',
        '15:00',
        'confirmed',
      );
      const past = await insertSlot(tx, shop, '07:00', '08:00');
      const windowId = await addWindow(tx, shop);
      // 시간대 안에서 손님이 잡았다가 결제 없이 끝난 칸
      const stale = await insertSlot(tx, shop, '16:00', '17:00', {
        windowId,
        holdCustomerId: other.customerId,
        holdExpiresAt: at('08:50'),
      });

      expect(await closeShopOpenSlots(tx, { shopId: shop.shopId, now: NOW })).toBe(3);

      for (const slotId of [open, notYet]) {
        expect(await slotRow(tx, slotId)).toMatchObject({
          status: 'closed',
          closeReason: 'account_withdrawal',
          closedAt: NOW,
        });
      }
      expect(await slotRow(tx, held)).toMatchObject({ status: 'published', closeReason: null });
      expect(await slotRow(tx, reserved.id)).toMatchObject({ status: 'reserved' });
      expect(await slotRow(tx, past)).toMatchObject({ status: 'published', closeReason: null });
      const [window] = await tx.select().from(slotWindows).where(eq(slotWindows.id, windowId));
      expect(window).toMatchObject({
        status: 'closed',
        closeReason: 'account_withdrawal',
        closedAt: NOW,
      });
      expect(await slotRow(tx, stale)).toMatchObject({
        status: 'closed',
        closeReason: 'hold_released',
      });
    });
  });

  it('원장님: 샵을 탈퇴로, 계정을 탈퇴로 바꾸고 원장님 푸시 구독만 지우고 탈퇴 전 샵 상태를 남긴다. 남의 샵·탈퇴한 계정은 잠그지 않는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const ownerId = await ownerIdOf(tx, shop.shopId);
      const userId = shop.createdBy;
      const someoneElse = await createTestShop(tx, { status: 'approved' });
      await tx
        .insert(pushSubscriptions)
        .values([pushOf(userId, 'customer'), pushOf(userId, 'owner')]);

      expect(await lockActiveOwnerShop(tx, { ownerId, shopId: someoneElse.shopId })).toBeNull();
      expect(await lockActiveOwnerShop(tx, { ownerId, shopId: shop.shopId })).toEqual({
        userId,
        email: `${userId}@test.invalid`,
        shopStatus: 'approved',
      });

      await applyOwnerWithdrawal(tx, {
        ownerId,
        shopId: shop.shopId,
        userId,
        shopStatusBefore: 'approved',
        closedSlotCount: 3,
        now: NOW,
      });

      const [shopRow] = await tx.select().from(shops).where(eq(shops.id, shop.shopId));
      expect(shopRow.status).toBe('withdrawn');
      const [owner] = await tx.select().from(owners).where(eq(owners.id, ownerId));
      expect(owner.withdrawnAt).toEqual(NOW);
      expect(
        (
          await tx
            .select({ accountType: pushSubscriptions.accountType })
            .from(pushSubscriptions)
            .where(eq(pushSubscriptions.userId, userId))
        ).map((row) => row.accountType),
      ).toEqual(['customer']);
      expect(
        await tx.select().from(accountWithdrawals).where(eq(accountWithdrawals.userId, userId)),
      ).toEqual([
        expect.objectContaining({
          accountType: 'owner',
          ownerId,
          customerId: null,
          withdrawnAt: NOW,
          shopStatusBefore: 'approved',
          forfeitedCouponCount: 0,
          closedSlotCount: 3,
        }),
      ]);
      expect(await lockActiveOwnerShop(tx, { ownerId, shopId: shop.shopId })).toBeNull();
    });
  });

  it('같은 사람 표시는 비어 있을 때만 채운다', async () => {
    await withRollback(async (tx) => {
      const { userId } = await createTestCustomer(tx);
      const hashOf = async () =>
        (await tx.select().from(profiles).where(eq(profiles.id, userId)))[0].identityHash;
      await fillIdentityHash(tx, { userId, identityHash: 'first' });
      expect(await hashOf()).toBe('first');
      await fillIdentityHash(tx, { userId, identityHash: 'second' });
      expect(await hashOf()).toBe('first');
    });
  });

  it('탈퇴한 고객은 한 시술 매물도 시간대도 홀딩하지 못한다(탈퇴와 [예약하기]가 겹쳐 잠금을 기다린 경우)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const slotId = await insertSlot(tx, shop, '10:00', '11:00');
      const windowId = await addWindow(tx, shop);
      await tx.update(customers).set({ withdrawnAt: NOW }).where(eq(customers.id, customerId));

      expect(await acquireHold(tx, { slotId, customerId, now: NOW })).toEqual({
        ok: false,
        code: 'SLOT_NOT_AVAILABLE',
      });
      expect(await slotRow(tx, slotId)).toMatchObject({ holdCustomerId: null });
      expect(
        await acquireWindowHold(tx, {
          windowId,
          menuId: shop.menuId,
          startAt: at('17:00'),
          customerId,
          now: NOW,
        }),
      ).toEqual({ ok: false, code: 'SLOT_NOT_AVAILABLE' });
      expect(
        await tx
          .select()
          .from(slots)
          .where(and(eq(slots.windowId, windowId), eq(slots.holdCustomerId, customerId))),
      ).toEqual([]);
    });
  });
});
