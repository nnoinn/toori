// 운영자 결제·환불 확인 화면(#373 ①)의 조회를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 다른 테스트의 주문·환불과 섞이지 않게 아주 오래전(2020년) 시각으로 넣고, 내가 넣은 줄만 골라 본다.

import { afterAll, expect, it } from 'vitest';

import { orders, refunds, slots } from '@/db/schema';
import { recordAdminAction } from '@/server/admin/action-store';
import { REFUND_REVIEW_CHECK_ACTION } from '@/server/admin/payment-issues-store';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  createTestUser,
  type TestShop,
  testSlot,
} from '../../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../../tests/db/test-db';
import {
  countPaymentIssues,
  selectRefundReviews,
  selectStuckCancels,
  selectStuckOrders,
  stuckSince,
} from './queries';

/** 기준 시각. 정리되지 않은 주문은 이보다 60분, 끝나지 않은 환불은 30분 전에 만든(요청한) 것이다 */
const NOW = new Date('2020-03-01T01:00:00Z');
const minutesBeforeNow = (minutes: number) => new Date(NOW.getTime() - minutes * 60 * 1000);

async function order(
  tx: TestTx,
  shop: TestShop,
  customerId: string,
  start: string,
  values: { status: string; createdAt: Date; updatedAt?: Date; failureCode?: string },
) {
  const [slot] = await tx
    .insert(slots)
    .values(testSlot(shop, start, addHour(start)))
    .returning();
  const [row] = await tx
    .insert(orders)
    .values({
      paymentId: `test_${crypto.randomUUID()}`,
      slotId: slot.id,
      customerId,
      salePrice: slot.salePrice,
      amount: slot.salePrice,
      refundPolicyVersion: 'test',
      refundPolicyAgreedAt: values.createdAt,
      updatedAt: values.updatedAt ?? values.createdAt,
      ...values,
    })
    .returning();
  return row;
}

function addHour(hm: string): string {
  const [h, m] = hm.split(':').map(Number);
  return `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function refundRow(
  made: Awaited<ReturnType<typeof createTestReservation>>,
  values: Partial<typeof refunds.$inferInsert> & { reason: string; status: string },
): typeof refunds.$inferInsert {
  return {
    orderId: made.order.id,
    reservationId: made.reservation.id,
    penaltyRate: 30,
    refundAmount: 9_800,
    penaltyAmount: 4_200,
    processedAt: values.status === 'done' ? NOW : null,
    ...values,
  };
}

describeDb('운영자 결제·환불 확인 조회 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('기준 시각: 주문은 60분, 환불은 30분 전', () => {
    expect(stuckSince(NOW)).toEqual({
      orders: minutesBeforeNow(60),
      cancels: minutesBeforeNow(30),
    });
  });

  it('정리되지 않은 주문: 60분이 지난 결제 대기·결제 확인 주문만 오래된 것부터, 손님 이름·샵·매물·정리 작업이 본 시각과 함께', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved', name: '확인 샵' });
      const { customerId } = await createTestCustomer(tx);
      const paid = await order(tx, shop, customerId, '09:00', {
        status: 'paid',
        createdAt: minutesBeforeNow(120),
        updatedAt: minutesBeforeNow(5),
        failureCode: 'AMOUNT_MISMATCH',
      });
      const pending = await order(tx, shop, customerId, '10:00', {
        status: 'pending',
        createdAt: minutesBeforeNow(61),
      });
      // 딱 60분: 아직 꼬인 건이 아니다(정리 작업이 더 볼 시간)
      const edge = await order(tx, shop, customerId, '11:00', {
        status: 'pending',
        createdAt: minutesBeforeNow(60),
      });
      const confirmed = await order(tx, shop, customerId, '12:00', {
        status: 'confirmed',
        createdAt: minutesBeforeNow(300),
      });
      const failed = await order(tx, shop, customerId, '13:00', {
        status: 'failed',
        createdAt: minutesBeforeNow(300),
      });
      const mine = [paid, pending, edge, confirmed, failed].map((row) => row.id);

      const { rows } = await selectStuckOrders(tx, { createdBefore: stuckSince(NOW).orders });
      const ours = rows.filter((row) => mine.includes(row.orderId));
      expect(ours.map((row) => row.orderId)).toEqual([paid.id, pending.id]);
      expect(ours[0]).toEqual({
        orderId: paid.id,
        paymentId: paid.paymentId,
        status: 'paid',
        amount: 14_000,
        failureCode: 'AMOUNT_MISMATCH',
        createdAt: minutesBeforeNow(120),
        checkedAt: minutesBeforeNow(5),
        customerId,
        customerName: '테스트 고객',
        shopId: shop.shopId,
        shopName: '확인 샵',
        slotStartAt: new Date('2026-11-01T09:00:00+09:00'),
        menuName: '커트',
      });
    });
  });

  it('끝나지 않은 환불: 30분이 지난 진행 중 고객 취소·합의 후 취소만, 예약번호·결제 번호와 함께', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved', name: '환불 샵' });
      const { customerId } = await createTestCustomer(tx);
      const book = (start: string) =>
        createTestReservation(tx, shop, customerId, start, addHour(start), 'confirmed');
      const customer = await book('09:00');
      const agreed = await book('10:00');
      const fresh = await book('11:00');
      const done = await book('12:00');
      await tx.insert(refunds).values([
        refundRow(customer, {
          reason: 'customer_cancel',
          status: 'requested',
          createdAt: minutesBeforeNow(45),
        }),
        refundRow(agreed, {
          reason: 'agreed_cancel',
          status: 'requested',
          createdAt: minutesBeforeNow(31),
          refundAmount: 7_000,
        }),
        refundRow(fresh, {
          reason: 'customer_cancel',
          status: 'requested',
          createdAt: minutesBeforeNow(30),
        }),
        refundRow(done, {
          reason: 'customer_cancel',
          status: 'done',
          createdAt: minutesBeforeNow(300),
        }),
      ]);
      const mine = [customer, agreed, fresh, done].map((made) => made.reservation.id);

      const { rows } = await selectStuckCancels(tx, { requestedBefore: stuckSince(NOW).cancels });
      const ours = rows.filter((row) => mine.includes(row.reservationId));
      expect(ours.map((row) => [row.reservationId, row.reason])).toEqual([
        [customer.reservation.id, 'customer_cancel'],
        [agreed.reservation.id, 'agreed_cancel'],
      ]);
      expect(ours[1]).toMatchObject({
        reservationCode: agreed.reservation.code,
        refundAmount: 7_000,
        requestedAt: minutesBeforeNow(31),
        paymentId: agreed.order.paymentId,
        customerName: '테스트 고객',
        shopName: '환불 샵',
      });
    });
  });

  it('금액 확인이 필요한 환불: 확인할 이유가 있고 [확인함]이 없는 환불만(예약 전 자동 취소 포함), 건수는 세 목록을 더한다', async () => {
    await withRollback(async (tx) => {
      const adminId = await createTestUser(tx);
      const shop = await createTestShop(tx, { status: 'approved', name: '확인 샵' });
      const { customerId } = await createTestCustomer(tx);
      const before = await countPaymentIssues(tx, NOW);

      const book = (start: string) =>
        createTestReservation(tx, shop, customerId, start, addHour(start), 'cancelled');
      const needsReview = await book('09:00');
      const checked = await book('10:00');
      const fine = await book('11:00');
      const autoCancelled = await order(tx, shop, customerId, '12:00', {
        status: 'auto_cancelled',
        createdAt: minutesBeforeNow(300),
      });
      const review = '포트원 환불액 9000원이 계산한 9800원과 달라요';
      const inserted = await tx
        .insert(refunds)
        .values([
          refundRow(needsReview, {
            reason: 'customer_cancel',
            status: 'done',
            reviewReason: review,
          }),
          refundRow(checked, { reason: 'customer_cancel', status: 'done', reviewReason: review }),
          refundRow(fine, { reason: 'customer_cancel', status: 'done' }),
          {
            orderId: autoCancelled.id,
            reservationId: null,
            reason: 'auto_cancel',
            status: 'done',
            penaltyRate: 0,
            refundAmount: 13_000,
            penaltyAmount: 0,
            reviewReason: '포트원 환불액이 결제액과 달라요',
            processedAt: NOW,
          },
        ])
        .returning({ id: refunds.id });
      const [first, second] = inserted;
      const mine = inserted.map((row) => row.id);
      await recordAdminAction(tx, {
        adminId,
        action: REFUND_REVIEW_CHECK_ACTION,
        targetType: 'refund',
        targetId: second.id,
        memo: '포트원 콘솔과 맞음',
      });
      // 같은 환불의 다른 기록은 [확인함]이 아니다
      await recordAdminAction(tx, {
        adminId,
        action: 'refund.retry',
        targetType: 'refund',
        targetId: first.id,
        memo: '다른 일',
      });

      const { rows } = await selectRefundReviews(tx);
      const ours = rows.filter((row) => mine.includes(row.refundId));
      expect(ours.map((row) => row.reservationCode)).toEqual([needsReview.reservation.code, null]);
      expect(ours[0]).toMatchObject({
        refundId: first.id,
        reason: 'customer_cancel',
        refundAmount: 9_800,
        reviewReason: review,
        reservationId: needsReview.reservation.id,
        paymentId: needsReview.order.paymentId,
        customerName: '테스트 고객',
        shopName: '확인 샵',
      });
      expect(ours[1]).toMatchObject({
        reason: 'auto_cancel',
        reservationId: null,
        paymentId: autoCancelled.paymentId,
      });

      // 꼬인 주문 하나(60분 지난 결제 확인)를 더하면 건수는 확인할 환불 2건 + 주문 1건만큼 는다
      await order(tx, shop, customerId, '13:00', {
        status: 'paid',
        createdAt: minutesBeforeNow(90),
      });
      expect((await countPaymentIssues(tx, NOW)) - before).toBe(3);
    });
  });
});
