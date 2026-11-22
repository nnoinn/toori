// 운영자 고객 상세 '쿠폰' 칸의 조회(A-102, C-407)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 그 고객의 쿠폰 전부(쓸 수 있음·사용함·기한 지남·돌려받음)와, 주문에 남은 쿠폰으로 찾은 '쓴 예약'을 본다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { coupons, orders, slots } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  testSlot,
} from '../../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../../tests/db/test-db';
import { selectCustomerCoupons } from './coupon-queries';

const at = (iso: string) => new Date(`${iso}+09:00`);
const DAY = 24 * 60 * 60 * 1000;

async function insertCoupon(
  tx: TestTx,
  customerId: string,
  issuedAt: Date,
  extra: Partial<typeof coupons.$inferInsert> = {},
) {
  const [row] = await tx
    .insert(coupons)
    .values({
      customerId,
      amount: 3000,
      reason: 'owner_fault_compensation',
      issuedAt,
      expiresAt: new Date(issuedAt.getTime() + 90 * DAY),
      ...extra,
    })
    .returning({ id: coupons.id });
  return row.id;
}

/** 주문에 쿠폰을 적고 결제 시각을 정한다(쓴 예약의 순서는 주문을 만든 시각으로 본다) */
async function useCouponOn(tx: TestTx, orderId: string, couponId: string, createdAt: Date) {
  await tx
    .update(orders)
    .set({ couponId, couponAmount: 3000, createdAt })
    .where(eq(orders.id, orderId));
}

describeDb('운영자 고객 상세 쿠폰 조회 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('그 고객의 쿠폰을 최근에 받은 것부터, 원인 예약·쓴 주문·쓴 예약(돌려받은 예약 포함)과 함께 읽는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const other = await createTestCustomer(tx);

      // 원장님 사정 취소로 보상 쿠폰을 받은 예약
      const source = await createTestReservation(
        tx,
        shop,
        me.customerId,
        '09:00',
        '10:00',
        'cancelled',
        { cancelActor: 'owner_fault', cancelledAt: at('2026-10-31T09:00:00') },
      );
      const compensation = await insertCoupon(tx, me.customerId, at('2001-01-05T10:00:00'), {
        sourceReservationId: source.reservation.id,
      });

      // 지금 쓰고 있는 쿠폰
      const used = await insertCoupon(tx, me.customerId, at('2001-01-04T10:00:00'));
      const usedOn = await createTestReservation(
        tx,
        shop,
        me.customerId,
        '10:00',
        '11:00',
        'confirmed',
      );
      await useCouponOn(tx, usedOn.order.id, used, at('2001-01-04T12:00:00'));
      const usedAt = at('2001-01-04T12:05:00');
      await tx
        .update(coupons)
        .set({ usedOrderId: usedOn.order.id, usedAt })
        .where(eq(coupons.id, used));

      // 한 번도 안 쓰고 기한이 지난 쿠폰
      const expired = await insertCoupon(tx, me.customerId, at('2001-01-03T10:00:00'));

      // 원장님 사정 취소로 돌려받았다가 다시 쓴 쿠폰: 쓴 예약 두 건(돌려받은 것 → 지금 쓴 것)
      const reused = await insertCoupon(tx, me.customerId, at('2001-01-02T10:00:00'));
      const returnedOn = await createTestReservation(
        tx,
        shop,
        me.customerId,
        '11:00',
        '12:00',
        'cancelled',
        { cancelActor: 'owner_fault', cancelledAt: at('2026-10-31T09:00:00') },
      );
      await useCouponOn(tx, returnedOn.order.id, reused, at('2001-01-02T12:00:00'));
      const reusedOn = await createTestReservation(
        tx,
        shop,
        me.customerId,
        '12:00',
        '13:00',
        'confirmed',
      );
      await useCouponOn(tx, reusedOn.order.id, reused, at('2001-01-03T12:00:00'));
      await tx
        .update(coupons)
        .set({ usedOrderId: reusedOn.order.id, usedAt: at('2001-01-03T12:05:00') })
        .where(eq(coupons.id, reused));

      // 결제를 시작했다가 실패한 주문에도 쿠폰이 적혀 있지만 예약이 아니라서 빼야 한다
      const [failedSlot] = await tx
        .insert(slots)
        .values(testSlot(shop, '13:00', '14:00'))
        .returning({ id: slots.id });
      await tx.insert(orders).values({
        paymentId: `test_${crypto.randomUUID()}`,
        slotId: failedSlot.id,
        customerId: me.customerId,
        salePrice: 14000,
        couponId: compensation,
        couponAmount: 3000,
        amount: 11000,
        refundPolicyVersion: 'test',
        refundPolicyAgreedAt: at('2026-10-30T10:00:00'),
        status: 'failed',
      });

      // 다른 고객의 쿠폰은 읽지 않는다
      await insertCoupon(tx, other.customerId, at('2001-01-06T10:00:00'));

      const rows = await selectCustomerCoupons(tx, me.customerId);
      expect(rows.map((row) => row.couponId)).toEqual([compensation, used, expired, reused]);

      expect(rows[0]).toEqual({
        couponId: compensation,
        amount: 3000,
        reason: 'owner_fault_compensation',
        source: { reservationId: source.reservation.id, code: source.reservation.code },
        issuedAt: at('2001-01-05T10:00:00'),
        expiresAt: new Date(at('2001-01-05T10:00:00').getTime() + 90 * DAY),
        usedOrderId: null,
        usedAt: null,
        uses: [],
      });
      expect(rows[1]).toMatchObject({
        source: null,
        usedOrderId: usedOn.order.id,
        usedAt,
        uses: [
          {
            reservationId: usedOn.reservation.id,
            code: usedOn.reservation.code,
            orderId: usedOn.order.id,
            cancelActor: null,
            voidedAt: null,
          },
        ],
      });
      expect(rows[2]).toMatchObject({ usedOrderId: null, uses: [] });
      expect(rows[3].usedOrderId).toBe(reusedOn.order.id);
      expect(rows[3].uses).toEqual([
        {
          reservationId: returnedOn.reservation.id,
          code: returnedOn.reservation.code,
          orderId: returnedOn.order.id,
          cancelActor: 'owner_fault',
          voidedAt: null,
        },
        {
          reservationId: reusedOn.reservation.id,
          code: reusedOn.reservation.code,
          orderId: reusedOn.order.id,
          cancelActor: null,
          voidedAt: null,
        },
      ]);
    });
  });

  it('쿠폰이 없는 고객은 빈 목록', async () => {
    await withRollback(async (tx) => {
      const me = await createTestCustomer(tx);
      expect(await selectCustomerCoupons(tx, me.customerId)).toEqual([]);
    });
  });
});
