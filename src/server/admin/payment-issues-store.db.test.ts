// 운영자 결제·환불 확인(#373 ①)의 읽기와 [확인함] 기록을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { adminActions, orders, refunds } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  createTestUser,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import { recordAdminAction } from './action-store';
import {
  hasRequestedCancel,
  lockRefundReview,
  readOrderState,
  REFUND_REVIEW_CHECK_ACTION,
} from './payment-issues-store';

async function booking(tx: TestTx, start = '10:00', end = '11:00') {
  const shop = await createTestShop(tx, { status: 'approved' });
  const { customerId } = await createTestCustomer(tx);
  return createTestReservation(tx, shop, customerId, start, end, 'confirmed');
}

describeDb('운영자 결제·환불 확인 저장 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('주문의 지금 상태와 만든 시각을 읽고, 없는 주문은 null', async () => {
    await withRollback(async (tx) => {
      const { order } = await booking(tx);
      const createdAt = new Date('2026-11-15T10:00:00+09:00');
      await tx.update(orders).set({ status: 'paid', createdAt }).where(eq(orders.id, order.id));
      expect(await readOrderState(tx, order.id)).toEqual({ status: 'paid', createdAt });
      expect(await readOrderState(tx, crypto.randomUUID())).toBeNull();
    });
  });

  it('진행 중인 고객 취소·합의 후 취소가 있는 예약만 true(끝난 환불·자동 취소 환불은 아니다)', async () => {
    await withRollback(async (tx) => {
      const requested = await booking(tx);
      const agreed = await booking(tx);
      const done = await booking(tx);
      const none = await booking(tx);
      const refund = (
        made: Awaited<ReturnType<typeof booking>>,
        reason: string,
        status: string,
      ) => ({
        orderId: made.order.id,
        reservationId: made.reservation.id,
        reason,
        status,
        penaltyRate: 30,
        refundAmount: 9_800,
        penaltyAmount: 4_200,
        processedAt: status === 'done' ? new Date() : null,
      });
      await tx
        .insert(refunds)
        .values([
          refund(requested, 'customer_cancel', 'requested'),
          refund(agreed, 'agreed_cancel', 'requested'),
          refund(done, 'customer_cancel', 'done'),
        ]);

      expect(await hasRequestedCancel(tx, requested.reservation.id)).toBe(true);
      expect(await hasRequestedCancel(tx, agreed.reservation.id)).toBe(true);
      expect(await hasRequestedCancel(tx, done.reservation.id)).toBe(false);
      expect(await hasRequestedCancel(tx, none.reservation.id)).toBe(false);
    });
  });

  it('[확인함]: 확인할 이유와 기록 여부를 읽고, 그 환불의 [확인함] 기록만 확인한 것으로 본다', async () => {
    await withRollback(async (tx) => {
      const adminId = await createTestUser(tx);
      const made = await booking(tx);
      const [refund] = await tx
        .insert(refunds)
        .values({
          orderId: made.order.id,
          reservationId: made.reservation.id,
          reason: 'customer_cancel',
          status: 'done',
          penaltyRate: 30,
          refundAmount: 9_000,
          penaltyAmount: 5_000,
          reviewReason: '포트원 환불액 9000원이 계산한 9800원과 달라요',
          processedAt: new Date(),
        })
        .returning({ id: refunds.id });

      expect(await lockRefundReview(tx, crypto.randomUUID())).toBeNull();
      expect(await lockRefundReview(tx, refund.id)).toEqual({
        reviewReason: '포트원 환불액 9000원이 계산한 9800원과 달라요',
        checked: false,
      });

      // 같은 환불의 다른 기록, 다른 대상의 [확인함]은 세지 않는다
      await recordAdminAction(tx, {
        adminId,
        action: 'refund.retry',
        targetType: 'refund',
        targetId: refund.id,
        memo: '다른 일',
      });
      await recordAdminAction(tx, {
        adminId,
        action: REFUND_REVIEW_CHECK_ACTION,
        targetType: 'refund',
        targetId: crypto.randomUUID(),
        memo: '다른 환불',
      });
      expect((await lockRefundReview(tx, refund.id))?.checked).toBe(false);

      await recordAdminAction(tx, {
        adminId,
        action: REFUND_REVIEW_CHECK_ACTION,
        targetType: 'refund',
        targetId: refund.id,
        memo: '포트원 콘솔과 맞음',
      });
      expect((await lockRefundReview(tx, refund.id))?.checked).toBe(true);

      const [row] = await tx
        .select()
        .from(adminActions)
        .where(eq(adminActions.memo, '포트원 콘솔과 맞음'));
      expect(row).toMatchObject({
        adminId,
        action: 'refund.review_check',
        targetType: 'refund',
        targetId: refund.id,
      });
    });
  });
});
