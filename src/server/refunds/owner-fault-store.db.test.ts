// 원장님 귀책 취소(X-207, #419)의 저장을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 진행 중 기록 → 환불 기록 끝(finishCancelRecord) → 쿠폰·패널티·합의 후 요청 닫기(recordOwnerFaultExtras)를 한 트랜잭션처럼 차례로 부른다.

import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import {
  agreedCancelRequests,
  coupons,
  orders,
  ownerPenalties,
  refunds,
  reservations,
  slots,
} from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import { recordOwnerFaultExtras } from './owner-fault-store';
import {
  finishCancelRecord,
  readRefundTargetForShop,
  readStaleCancels,
  requestCancelRefund,
} from './refund-store';

// testSlot의 시작(2026-11-01 09:00 한국 시간)보다 하루 앞
const NOW = new Date('2026-10-31T09:00:00+09:00');
const DAY_MS = 24 * 60 * 60 * 1000;
const OLD_EXPIRY = new Date('2026-12-01T00:00:00+09:00');

/** 손님이 3,000원 쿠폰을 쓴 예약(쿠폰은 다른 예약의 보상 쿠폰이었다) */
async function bookingWithCoupon(tx: TestTx) {
  const shop = await createTestShop(tx, { status: 'approved' });
  const { customerId } = await createTestCustomer(tx);
  const earlier = await createTestReservation(tx, shop, customerId, '07:00', '08:00', 'cancelled');
  const made = await createTestReservation(tx, shop, customerId, '09:00', '10:00', 'confirmed');
  const [coupon] = await tx
    .insert(coupons)
    .values({
      customerId,
      amount: 3_000,
      reason: 'owner_fault_compensation',
      sourceReservationId: earlier.reservation.id,
      issuedAt: new Date('2026-09-02T00:00:00+09:00'),
      expiresAt: OLD_EXPIRY,
      usedOrderId: made.order.id,
      usedAt: new Date('2026-10-30T10:00:00+09:00'),
    })
    .returning();
  await tx
    .update(orders)
    .set({ couponId: coupon.id, couponAmount: 3_000, amount: made.order.salePrice - 3_000 })
    .where(eq(orders.id, made.order.id));
  return { shop, customerId, made, coupon, paidAmount: made.order.salePrice - 3_000 };
}

async function finishOwnerFault(
  tx: TestTx,
  made: Awaited<ReturnType<typeof createTestReservation>>,
  paidAmount: number,
) {
  const requested = {
    reason: 'owner_fault' as const,
    band: null,
    penaltyRate: 0,
    refundAmount: paidAmount,
    penaltyAmount: 0,
    requestedAt: NOW,
  };
  expect(
    await requestCancelRefund(tx, {
      reservationId: made.reservation.id,
      orderId: made.order.id,
      ...requested,
    }),
  ).toBe(true);
  expect(
    await finishCancelRecord(tx, {
      ...requested,
      reservationId: made.reservation.id,
      orderId: made.order.id,
      slotId: made.slot.id,
      pgCancellationId: 'c-1',
      reviewReason: null,
      hoursBeforeStart: 24,
      now: NOW,
    }),
  ).toBe(true);
  return recordOwnerFaultExtras(tx, {
    reservationId: made.reservation.id,
    orderId: made.order.id,
    now: NOW,
  });
}

describeDb('원장님 귀책 취소 저장 (실제 DB)', () => {
  afterAll(closeTestDb);

  describe('내 샵 예약 읽기와 정리 작업', () => {
    it('내 샵 예약만 읽고, 진행 중인 원장님 귀책 취소가 보이며, 정리 작업 대상이다', async () => {
      await withRollback(async (tx) => {
        const { shop, made, paidAmount } = await bookingWithCoupon(tx);
        const other = await createTestShop(tx, { status: 'approved' });
        await requestCancelRefund(tx, {
          reservationId: made.reservation.id,
          orderId: made.order.id,
          reason: 'owner_fault',
          band: null,
          penaltyRate: 0,
          refundAmount: paidAmount,
          penaltyAmount: 0,
          requestedAt: NOW,
        });

        const target = await readRefundTargetForShop(made.reservation.id, shop.shopId, tx);
        expect(target).toMatchObject({
          reservationId: made.reservation.id,
          status: 'confirmed',
          paidAmount,
          couponAmount: 3_000,
          requested: { reason: 'owner_fault', refundAmount: paidAmount, band: null },
        });
        expect(await readRefundTargetForShop(made.reservation.id, other.shopId, tx)).toBeNull();

        const stale = await readStaleCancels(tx, {
          requestedBefore: new Date(NOW.getTime() + 60_000),
          limit: 1,
          reservationId: made.reservation.id,
        });
        expect(stale).toMatchObject([
          { reservationId: made.reservation.id, reason: 'owner_fault' },
        ]);
      });
    });
  });

  it('끝내면 예약·매물 취소(취소한 쪽 owner_fault), 쓴 쿠폰을 기한 그대로 돌려주고, 보상 쿠폰 3,000원(90일)·패널티 5,000원을 남기고 합의 후 요청을 닫는다', async () => {
    await withRollback(async (tx) => {
      const { shop, customerId, made, coupon, paidAmount } = await bookingWithCoupon(tx);
      const [agreed] = await tx
        .insert(agreedCancelRequests)
        .values({
          reservationId: made.reservation.id,
          requestedBy: shop.createdBy,
          reason: 'style_mismatch',
          status: 'requested',
          requestedAt: new Date(NOW.getTime() - 60 * 60 * 1000),
          expiresAt: new Date(NOW.getTime() + 23 * 60 * 60 * 1000),
        })
        .returning({ id: agreedCancelRequests.id });

      expect(await finishOwnerFault(tx, made, paidAmount)).toEqual({ couponReturned: true });

      const [reservation] = await tx
        .select()
        .from(reservations)
        .where(eq(reservations.id, made.reservation.id));
      expect(reservation).toMatchObject({
        status: 'cancelled',
        cancelActor: 'owner_fault',
        cancelledAt: NOW,
        hoursBeforeStartAtCancel: 24,
      });
      const [slot] = await tx.select().from(slots).where(eq(slots.id, made.slot.id));
      expect(slot.status).toBe('cancelled');
      expect(
        await tx.select().from(refunds).where(eq(refunds.reservationId, made.reservation.id)),
      ).toMatchObject([
        { reason: 'owner_fault', status: 'done', refundAmount: paidAmount, penaltyAmount: 0 },
      ]);

      const [returned] = await tx.select().from(coupons).where(eq(coupons.id, coupon.id));
      expect(returned).toMatchObject({ usedOrderId: null, usedAt: null, expiresAt: OLD_EXPIRY });

      const compensation = await tx
        .select()
        .from(coupons)
        .where(eq(coupons.sourceReservationId, made.reservation.id));
      expect(compensation).toMatchObject([
        {
          customerId,
          amount: 3_000,
          reason: 'owner_fault_compensation',
          issuedAt: NOW,
          expiresAt: new Date(NOW.getTime() + 90 * DAY_MS),
          usedOrderId: null,
        },
      ]);

      expect(
        await tx
          .select()
          .from(ownerPenalties)
          .where(eq(ownerPenalties.reservationId, made.reservation.id)),
      ).toMatchObject([{ shopId: shop.shopId, amount: 5_000, collectedAmount: 0, createdAt: NOW }]);

      const [request] = await tx
        .select()
        .from(agreedCancelRequests)
        .where(eq(agreedCancelRequests.id, agreed.id));
      expect(request).toMatchObject({ status: 'closed', respondedAt: NOW });
    });
  });

  it('다시 돌아도 보상 쿠폰·패널티는 하나이고 쿠폰을 다시 돌려줬다고 하지 않는다', async () => {
    await withRollback(async (tx) => {
      const { made, paidAmount } = await bookingWithCoupon(tx);
      await finishOwnerFault(tx, made, paidAmount);

      expect(
        await recordOwnerFaultExtras(tx, {
          reservationId: made.reservation.id,
          orderId: made.order.id,
          now: new Date(NOW.getTime() + 60_000),
        }),
      ).toEqual({ couponReturned: false });
      expect(
        await tx.select().from(coupons).where(eq(coupons.sourceReservationId, made.reservation.id)),
      ).toHaveLength(1);
      expect(
        await tx
          .select()
          .from(ownerPenalties)
          .where(eq(ownerPenalties.reservationId, made.reservation.id)),
      ).toHaveLength(1);
    });
  });

  it('쿠폰을 쓰지 않은 예약은 돌려줄 쿠폰이 없고 보상 쿠폰·패널티만 남긴다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const made = await createTestReservation(tx, shop, customerId, '09:00', '10:00', 'confirmed');
      expect(await finishOwnerFault(tx, made, made.order.amount)).toEqual({
        couponReturned: false,
      });
      expect(
        await tx.select().from(coupons).where(eq(coupons.sourceReservationId, made.reservation.id)),
      ).toHaveLength(1);
    });
  });
});
