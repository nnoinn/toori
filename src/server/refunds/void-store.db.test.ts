// 예약 무효(A-108, #423)의 저장을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 시작(진행 중 기록·처리 기록, 막는 조건) → 끝(무효 시각, 예정이면 예약·매물 취소, 환불 기록 끝, 쿠폰 돌려주기, 합의 후 요청 닫기,
// 묶이지 않은 정산 줄 지우기)과, 진행 중 환불은 예약당 하나(refunds_requested_unique), 정산 묶기 후보·방문 처리와 겹치지 않는지 본다.

import { and, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it, vi } from 'vitest';

import type { getDb } from '@/db';
import {
  adminActions,
  agreedCancelRequests,
  coupons,
  orders,
  refunds,
  reservations,
  settlementItems,
  settlements,
  slots,
} from '@/db/schema';
import { readBatchCandidates } from '@/server/settlements/batch-store';
import { recordVisitInTx } from '@/server/visits/visit-store';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  createTestUser,
  type TestShop,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import { readRefundTarget, requestCancelRefund } from './refund-store';
import {
  clearVoidRequest,
  finishVoid,
  lockVoidTarget,
  readStaleVoids,
  readVoidTarget,
  startVoid,
} from './void-store';

type Db = ReturnType<typeof getDb>;

// testSlot의 시작(2026-11-01 09:00 한국 시간)보다 하루 앞
const NOW = new Date('2026-10-31T09:00:00+09:00');
const EXPIRY = new Date('2027-01-29T00:00:00+09:00');
const REQUEST = '11/14 통화, 손님과 합의가 안 돼 전액 환불 요청';

type Made = Awaited<ReturnType<typeof createTestReservation>>;

/** 손님이 3,000원 쿠폰을 쓴 예정 예약(쿠폰은 다른 예약의 보상 쿠폰이었다) */
async function bookingWithCoupon(tx: TestTx) {
  const shop = await createTestShop(tx, { status: 'approved' });
  const { userId: customerUserId, customerId } = await createTestCustomer(tx);
  const earlier = await createTestReservation(tx, shop, customerId, '07:00', '08:00', 'cancelled');
  const made = await createTestReservation(tx, shop, customerId, '09:00', '10:00', 'confirmed');
  const [coupon] = await tx
    .insert(coupons)
    .values({
      customerId,
      amount: 3_000,
      reason: 'owner_fault_compensation',
      sourceReservationId: earlier.reservation.id,
      issuedAt: new Date('2026-10-01T00:00:00+09:00'),
      expiresAt: EXPIRY,
      usedOrderId: made.order.id,
      usedAt: new Date('2026-10-30T10:00:00+09:00'),
    })
    .returning();
  const paidAmount = made.order.salePrice - 3_000;
  await tx
    .update(orders)
    .set({ couponId: coupon.id, couponAmount: 3_000, amount: paidAmount })
    .where(eq(orders.id, made.order.id));
  const adminId = await createTestUser(tx);
  return { shop, customerUserId, customerId, made, coupon, paidAmount, adminId };
}

function start(tx: TestTx, made: Made, refundAmount: number, adminId: string) {
  return startVoid(tx as unknown as Db, {
    reservationId: made.reservation.id,
    orderId: made.order.id,
    refundAmount,
    adminId,
    ownerRequest: REQUEST,
    now: NOW,
  });
}

function finish(tx: TestTx, made: Made, refundAmount: number, extra = {}) {
  return finishVoid(tx, {
    reservationId: made.reservation.id,
    orderId: made.order.id,
    slotId: made.slot.id,
    startAt: made.slot.startAt,
    refundAmount,
    pgCancellationId: 'c-void',
    now: NOW,
    ...extra,
  });
}

/** 아직 묶지 않은(또는 settlementId 묶음에 묶인) 정산 줄 */
async function settlementItem(tx: TestTx, shop: TestShop, made: Made, settlementId?: string) {
  await tx.insert(settlementItems).values({
    shopId: shop.shopId,
    orderId: made.order.id,
    kind: 'sale',
    baseAmount: made.order.salePrice,
    feeRate: 0,
    feeAmount: 0,
    feeVat: 0,
    paymentFeeRate: 3.3,
    paymentFee: 462,
    paymentFeeVat: 46,
    payoutAmount: made.order.salePrice - 508,
    pgFeeActual: null,
    settlementId: settlementId ?? null,
  });
}

async function pendingSettlement(tx: TestTx, shop: TestShop) {
  const [row] = await tx
    .insert(settlements)
    .values({
      shopId: shop.shopId,
      periodStart: '2026-10-30',
      periodEnd: '2026-11-05',
      itemCount: 1,
      totalBaseAmount: 14_000,
      totalFeeAmount: 0,
      penaltyDeducted: 0,
      payoutAmount: 13_492,
      status: 'pending',
    })
    .returning();
  return row;
}

const voidRefunds = (tx: TestTx, reservationId: string) =>
  tx
    .select()
    .from(refunds)
    .where(and(eq(refunds.reservationId, reservationId), eq(refunds.reason, 'void')));

describeDb('예약 무효 저장 (실제 DB)', () => {
  afterAll(closeTestDb);

  describe('무효로 할 예약 읽기', () => {
    it('실제 결제액, 끝난 환불 합계, 아직 쓴 상태인 쿠폰, 정산 묶임을 읽는다', async () => {
      await withRollback(async (tx) => {
        const { shop, made, paidAmount } = await bookingWithCoupon(tx);
        expect(await readVoidTarget(tx, made.reservation.id)).toEqual({
          reservationId: made.reservation.id,
          orderId: made.order.id,
          slotId: made.slot.id,
          paymentId: made.order.paymentId,
          status: 'confirmed',
          startAt: made.slot.startAt,
          paidAmount,
          refundedAmount: 0,
          usedCouponAmount: 3_000,
          voidedAt: null,
          settlementBundled: false,
          cancelInProgress: false,
          voidRequested: null,
        });

        // 고객 취소로 일부 돌려줬고, 그 정산 줄이 묶였다
        await tx.insert(refunds).values({
          orderId: made.order.id,
          reservationId: made.reservation.id,
          reason: 'customer_cancel',
          status: 'done',
          band: 'over_24h',
          penaltyRate: 30,
          refundAmount: 7_700,
          penaltyAmount: 3_300,
          processedAt: NOW,
          createdAt: NOW,
        });
        await settlementItem(tx, shop, made, (await pendingSettlement(tx, shop)).id);
        expect(await readVoidTarget(tx, made.reservation.id)).toMatchObject({
          refundedAmount: 7_700,
          settlementBundled: true,
        });
        expect(await readVoidTarget(tx, crypto.randomUUID())).toBeNull();
      });
    });
  });

  describe('무효 시작', () => {
    it('진행 중 무효 환불과 처리 기록(메모 = 원장님 요청)을 남기고, 그동안 다른 취소·두 번째 시작은 들어오지 않는다', async () => {
      await withRollback(async (tx) => {
        const { made, paidAmount, adminId, customerId } = await bookingWithCoupon(tx);
        expect(await start(tx, made, paidAmount, adminId)).toBe('started');

        expect(await voidRefunds(tx, made.reservation.id)).toEqual([
          expect.objectContaining({
            orderId: made.order.id,
            status: 'requested',
            band: null,
            penaltyRate: 0,
            refundAmount: paidAmount,
            penaltyAmount: 0,
            processedBy: adminId,
            createdAt: NOW,
          }),
        ]);
        expect(
          await tx
            .select()
            .from(adminActions)
            .where(eq(adminActions.targetId, made.reservation.id)),
        ).toEqual([
          expect.objectContaining({
            adminId,
            action: 'reservation.void',
            targetType: 'reservation',
            memo: REQUEST,
          }),
        ]);
        expect((await readVoidTarget(tx, made.reservation.id))?.voidRequested).toEqual({
          refundAmount: paidAmount,
          requestedAt: NOW,
        });
        // 취소 흐름·웹훅이 무효 진행 중을 본다
        expect(
          (await readRefundTarget(made.reservation.id, customerId, tx as unknown as Db))
            ?.voidInProgress,
        ).toBe(true);
        // 진행 중 환불은 예약당 하나: 고객 취소 시작은 에러 없이 false
        expect(
          await requestCancelRefund(tx, {
            reservationId: made.reservation.id,
            orderId: made.order.id,
            reason: 'customer_cancel',
            band: 'over_24h',
            penaltyRate: 30,
            refundAmount: 7_700,
            penaltyAmount: 3_300,
            requestedAt: NOW,
          }),
        ).toBe(false);
        expect(await start(tx, made, paidAmount, adminId)).toBe('CANCEL_IN_PROGRESS');
        expect(await voidRefunds(tx, made.reservation.id)).toHaveLength(1);

        // 정리 작업은 기준 시각보다 먼저 시작한 것만 고른다
        const staleBefore = new Date(NOW.getTime() + 1);
        expect(
          await readStaleVoids(tx, { requestedBefore: staleBefore, limit: 20 }),
        ).toContainEqual({
          reservationId: made.reservation.id,
          orderId: made.order.id,
          slotId: made.slot.id,
          paymentId: made.order.paymentId,
          startAt: made.slot.startAt,
          refundAmount: paidAmount,
        });
        expect(
          (await readStaleVoids(tx, { requestedBefore: NOW, limit: 20 })).map(
            (row) => row.reservationId,
          ),
        ).not.toContain(made.reservation.id);
      });
    });

    it('다른 취소 진행 중·정산에 묶임·이미 무효면 아무것도 남기지 않는다', async () => {
      await withRollback(async (tx) => {
        const { shop, made, paidAmount, adminId } = await bookingWithCoupon(tx);
        await requestCancelRefund(tx, {
          reservationId: made.reservation.id,
          orderId: made.order.id,
          reason: 'customer_cancel',
          band: 'over_24h',
          penaltyRate: 30,
          refundAmount: 7_700,
          penaltyAmount: 3_300,
          requestedAt: NOW,
        });
        expect(await start(tx, made, paidAmount, adminId)).toBe('CANCEL_IN_PROGRESS');
        await tx.delete(refunds).where(eq(refunds.reservationId, made.reservation.id));

        await settlementItem(tx, shop, made, (await pendingSettlement(tx, shop)).id);
        expect(await start(tx, made, paidAmount, adminId)).toBe('SETTLEMENT_BUNDLED');
        await tx.delete(settlementItems).where(eq(settlementItems.orderId, made.order.id));

        await tx
          .update(reservations)
          .set({ voidedAt: NOW })
          .where(eq(reservations.id, made.reservation.id));
        expect(await start(tx, made, paidAmount, adminId)).toBe('ALREADY_VOIDED');

        expect(await voidRefunds(tx, made.reservation.id)).toEqual([]);
        expect(
          await tx
            .select()
            .from(adminActions)
            .where(eq(adminActions.targetId, made.reservation.id)),
        ).toEqual([]);
      });
    });
  });

  describe('무효 끝', () => {
    it('예정 예약: 무효 시각, 예약·매물 취소(취소한 쪽 운영자), 환불 끝, 쿠폰 원래 기한으로 돌려주기, 합의 후 요청 닫기, 묶이지 않은 정산 줄 지우기', async () => {
      await withRollback(async (tx) => {
        const { shop, made, paidAmount, adminId, coupon } = await bookingWithCoupon(tx);
        await tx.insert(agreedCancelRequests).values({
          reservationId: made.reservation.id,
          requestedBy: shop.createdBy,
          reason: 'style_mismatch',
          status: 'requested',
          requestedAt: new Date(NOW.getTime() - 60 * 60 * 1000),
          expiresAt: new Date(NOW.getTime() + 23 * 60 * 60 * 1000),
        });
        await settlementItem(tx, shop, made);
        await start(tx, made, paidAmount, adminId);

        expect(await finish(tx, made, paidAmount)).toEqual({ couponReturned: true });

        const [reservation] = await tx
          .select()
          .from(reservations)
          .where(eq(reservations.id, made.reservation.id));
        expect(reservation).toMatchObject({
          voidedAt: NOW,
          status: 'cancelled',
          cancelledAt: NOW,
          cancelActor: 'admin',
          hoursBeforeStartAtCancel: 24,
        });
        const [slot] = await tx.select().from(slots).where(eq(slots.id, made.slot.id));
        expect(slot.status).toBe('cancelled');
        expect(await voidRefunds(tx, made.reservation.id)).toEqual([
          expect.objectContaining({
            status: 'done',
            refundAmount: paidAmount,
            pgCancellationId: 'c-void',
            processedAt: NOW,
          }),
        ]);
        const [order] = await tx.select().from(orders).where(eq(orders.id, made.order.id));
        expect(order.pgStatus).toBe('CANCELLED');
        const [returned] = await tx.select().from(coupons).where(eq(coupons.id, coupon.id));
        expect(returned).toMatchObject({ usedOrderId: null, usedAt: null, expiresAt: EXPIRY });
        const [request] = await tx
          .select()
          .from(agreedCancelRequests)
          .where(eq(agreedCancelRequests.reservationId, made.reservation.id));
        expect(request).toMatchObject({ status: 'closed', respondedAt: NOW });
        expect(
          await tx.select().from(settlementItems).where(eq(settlementItems.orderId, made.order.id)),
        ).toEqual([]);

        // 두 번째로 끝내면(정리 작업과 겹침) 아무것도 바꾸지 않는다
        expect(await finish(tx, made, paidAmount)).toBeNull();
      });
    });

    it('이용 완료 예약은 상태와 방문 기록을 그대로 두고, 묶인 정산 줄은 지우지 않고 알린다', async () => {
      await withRollback(async (tx) => {
        const shop = await createTestShop(tx, { status: 'approved' });
        const { customerId } = await createTestCustomer(tx);
        const adminId = await createTestUser(tx);
        const visitedAt = new Date('2026-11-01T10:00:00+09:00');
        const made = await createTestReservation(
          tx,
          shop,
          customerId,
          '09:00',
          '10:00',
          'completed',
          {
            visitResult: 'visited',
            visitRecordedAt: visitedAt,
            visitRecordedBy: shop.createdBy,
          },
        );
        await start(tx, made, made.order.amount, adminId);
        // 시작한 뒤 목요일 묶기가 먼저 묶었다(시작할 때는 막는다)
        await settlementItem(tx, shop, made, (await pendingSettlement(tx, shop)).id);
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});

        expect(await finish(tx, made, made.order.amount)).toEqual({ couponReturned: false });

        const [reservation] = await tx
          .select()
          .from(reservations)
          .where(eq(reservations.id, made.reservation.id));
        expect(reservation).toMatchObject({
          voidedAt: NOW,
          status: 'completed',
          visitResult: 'visited',
          visitRecordedAt: visitedAt,
          cancelledAt: null,
          cancelActor: null,
        });
        const [slot] = await tx.select().from(slots).where(eq(slots.id, made.slot.id));
        expect(slot.status).toBe(made.slot.status);
        expect(
          await tx.select().from(settlementItems).where(eq(settlementItems.orderId, made.order.id)),
        ).toHaveLength(1);
        expect(error).toHaveBeenCalledTimes(1);
        error.mockRestore();
      });
    });

    it('돌려줄 돈이 없는 무효는 진행 중 기록 없이 끝내고 처리 기록을 같은 트랜잭션에서 남긴다', async () => {
      await withRollback(async (tx) => {
        const { made, adminId } = await bookingWithCoupon(tx);
        const locked = await lockVoidTarget(tx, made.reservation.id);
        expect(locked?.reservationId).toBe(made.reservation.id);

        expect(
          await finish(tx, made, 0, {
            pgCancellationId: null,
            record: { adminId, ownerRequest: REQUEST },
          }),
        ).toEqual({ couponReturned: true });
        expect(await voidRefunds(tx, made.reservation.id)).toEqual([]);
        const [order] = await tx.select().from(orders).where(eq(orders.id, made.order.id));
        expect(order.pgStatus).not.toBe('CANCELLED');
        expect(
          await tx
            .select()
            .from(adminActions)
            .where(eq(adminActions.targetId, made.reservation.id)),
        ).toEqual([expect.objectContaining({ action: 'reservation.void', memo: REQUEST })]);
      });
    });

    it('진행 중 기록 지우기는 진행 중 무효만 지운다(끝난 고객 취소 환불은 그대로)', async () => {
      await withRollback(async (tx) => {
        const { made, adminId } = await bookingWithCoupon(tx);
        await tx.insert(refunds).values({
          orderId: made.order.id,
          reservationId: made.reservation.id,
          reason: 'customer_cancel',
          status: 'done',
          band: 'over_24h',
          penaltyRate: 30,
          refundAmount: 7_700,
          penaltyAmount: 3_300,
          processedAt: NOW,
          createdAt: NOW,
        });
        await start(tx, made, 3_300, adminId);
        await clearVoidRequest(tx, made.reservation.id);
        expect(
          (
            await tx.select().from(refunds).where(eq(refunds.reservationId, made.reservation.id))
          ).map((row) => row.reason),
        ).toEqual(['customer_cancel']);
      });
    });
  });

  describe('다른 처리와 겹치지 않기', () => {
    it('무효로 했거나 무효가 진행 중인 이용 완료 예약은 정산 묶기 후보에서 빠진다', async () => {
      await withRollback(async (tx) => {
        const shop = await createTestShop(tx, { status: 'approved' });
        const { customerId } = await createTestCustomer(tx);
        const adminId = await createTestUser(tx);
        const completed = (startAt: string, endAt: string) =>
          createTestReservation(tx, shop, customerId, startAt, endAt, 'completed', {
            visitResult: 'visited',
            visitRecordedAt: new Date('2026-11-01T13:00:00+09:00'),
            visitRecordedBy: shop.createdBy,
          });
        const normal = await completed('09:00', '10:00');
        const voided = await completed('10:00', '11:00');
        const voiding = await completed('11:00', '12:00');
        await tx
          .update(reservations)
          .set({ voidedAt: NOW })
          .where(eq(reservations.id, voided.reservation.id));
        await start(tx, voiding, voiding.order.amount, adminId);

        const candidates = await readBatchCandidates(tx, {
          cutoff: new Date('2026-11-12T00:00:00+09:00'),
        });
        const mine = candidates.filter((row) => row.shopId === shop.shopId);
        expect(mine.map((row) => row.orderId)).toEqual([normal.order.id]);
        expect(mine[0]?.voidedAt).toBeNull();
      });
    });

    it('무효가 진행 중이면 방문·노쇼 처리는 기다린다(CANCEL_IN_PROGRESS)', async () => {
      await withRollback(async (tx) => {
        const { shop, made, paidAmount, adminId } = await bookingWithCoupon(tx);
        await start(tx, made, paidAmount, adminId);
        const result = await recordVisitInTx(tx as unknown as Db, {
          shopId: shop.shopId,
          reservationId: made.reservation.id,
          result: 'visited',
          recordedBy: shop.createdBy,
          now: new Date('2026-11-01T10:00:00+09:00'),
        });
        expect(result).toMatchObject({ ok: false, error: { code: 'CANCEL_IN_PROGRESS' } });
      });
    });
  });
});
