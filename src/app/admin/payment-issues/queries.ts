// 운영자 결제·환불 확인 화면(#373 ①)의 조회. 이 화면과 운영자 첫 화면의 건수에서만 쓴다.
// 다시 시도·[확인함]은 '@/server/admin/payment-issues'가 한다. 고객 연락처는 읽지 않는다(이름만).

import 'server-only';

import { and, asc, count, eq, inArray, isNotNull, lt, notExists } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { getDb } from '@/db';
import { adminActions, customers, orders, refunds, reservations, shops, slots } from '@/db/schema';
import { REFUND_REVIEW_CHECK_ACTION } from '@/server/admin/payment-issues-store';
import { STUCK_CANCEL_MINUTES, STUCK_ORDER_MINUTES } from '@/server/policy';
import { CANCEL_REFUND_REASONS } from '@/server/refunds/refund-store';

import { ADMIN_LIST_LIMIT, toListResult } from '../lookup';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

/** 결제 정리 작업이 고치지 못한 주문. paid: 결제는 됐는데 예약이 안 됨, pending: 결과를 모름 */
export type StuckOrderRow = {
  orderId: string;
  /** 포트원 결제 번호. 포트원 콘솔에서 찾을 때 쓴다 */
  paymentId: string;
  status: 'pending' | 'paid';
  amount: number;
  failureCode: string | null;
  createdAt: Date;
  /** 정리 작업이 마지막으로 본 시각(정하지 못하면 updated_at을 바꾼다) */
  checkedAt: Date;
  customerId: string;
  customerName: string;
  shopId: string;
  shopName: string;
  slotStartAt: Date;
  menuName: string;
};

/** 끝나지 않은 고객 취소·합의 후 취소 */
export type StuckCancelRow = {
  refundId: string;
  reservationId: string;
  reservationCode: string;
  reason: string;
  refundAmount: number;
  requestedAt: Date;
  paymentId: string;
  customerName: string;
  shopName: string;
};

/** 금액 확인이 필요한 환불(아직 [확인함]을 누르지 않은 것). 자동 취소 환불은 예약이 없다 */
export type RefundReviewRow = {
  refundId: string;
  reason: string;
  refundAmount: number;
  reviewReason: string;
  processedAt: Date | null;
  reservationId: string | null;
  reservationCode: string | null;
  paymentId: string;
  customerName: string;
  shopName: string;
};

/** 꼬인 건으로 보는 기준 시각. 이보다 먼저 만든(요청한) 것만 고른다 */
export function stuckSince(now: Date): { orders: Date; cancels: Date } {
  return {
    orders: new Date(now.getTime() - STUCK_ORDER_MINUTES * 60 * 1000),
    cancels: new Date(now.getTime() - STUCK_CANCEL_MINUTES * 60 * 1000),
  };
}

const stuckOrderWhere = (createdBefore: Date) =>
  and(inArray(orders.status, ['pending', 'paid']), lt(orders.createdAt, createdBefore));

const stuckCancelWhere = (requestedBefore: Date) =>
  and(
    eq(refunds.status, 'requested'),
    inArray(refunds.reason, CANCEL_REFUND_REASONS),
    lt(refunds.createdAt, requestedBefore),
  );

const checkedReview = alias(adminActions, 'checked_review');

function reviewWhere(db: DbReader) {
  return and(
    isNotNull(refunds.reviewReason),
    notExists(
      db
        .select({ id: checkedReview.id })
        .from(checkedReview)
        .where(
          and(
            eq(checkedReview.action, REFUND_REVIEW_CHECK_ACTION),
            eq(checkedReview.targetType, 'refund'),
            eq(checkedReview.targetId, refunds.id),
          ),
        ),
    ),
  );
}

/** 정리 작업이 고치지 못한 주문, 오래된 것부터 */
export async function selectStuckOrders(
  db: DbReader,
  input: { createdBefore: Date },
): Promise<{ rows: StuckOrderRow[]; hasMore: boolean }> {
  const rows = await db
    .select({
      orderId: orders.id,
      paymentId: orders.paymentId,
      status: orders.status,
      amount: orders.amount,
      failureCode: orders.failureCode,
      createdAt: orders.createdAt,
      checkedAt: orders.updatedAt,
      customerId: customers.id,
      customerName: customers.name,
      shopId: shops.id,
      shopName: shops.name,
      slotStartAt: slots.startAt,
      menuName: slots.menuName,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(slots, eq(slots.id, orders.slotId))
    .innerJoin(shops, eq(shops.id, slots.shopId))
    .where(stuckOrderWhere(input.createdBefore))
    .orderBy(asc(orders.createdAt), asc(orders.id))
    .limit(ADMIN_LIST_LIMIT + 1);
  // 조건이 두 상태만 고른다
  return toListResult(rows as StuckOrderRow[]);
}

/** 끝나지 않은 환불, 오래된 것부터 */
export async function selectStuckCancels(
  db: DbReader,
  input: { requestedBefore: Date },
): Promise<{ rows: StuckCancelRow[]; hasMore: boolean }> {
  const rows = await db
    .select({
      refundId: refunds.id,
      reservationId: reservations.id,
      reservationCode: reservations.code,
      reason: refunds.reason,
      refundAmount: refunds.refundAmount,
      requestedAt: refunds.createdAt,
      paymentId: orders.paymentId,
      customerName: customers.name,
      shopName: shops.name,
    })
    .from(refunds)
    .innerJoin(reservations, eq(reservations.id, refunds.reservationId))
    .innerJoin(orders, eq(orders.id, reservations.orderId))
    .innerJoin(customers, eq(customers.id, reservations.customerId))
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .innerJoin(shops, eq(shops.id, slots.shopId))
    .where(stuckCancelWhere(input.requestedBefore))
    .orderBy(asc(refunds.createdAt), asc(refunds.id))
    .limit(ADMIN_LIST_LIMIT + 1);
  return toListResult(rows);
}

/** 금액 확인이 필요한 환불 중 아직 [확인함]을 누르지 않은 것, 오래된 것부터 */
export async function selectRefundReviews(
  db: DbReader,
): Promise<{ rows: RefundReviewRow[]; hasMore: boolean }> {
  const rows = await db
    .select({
      refundId: refunds.id,
      reason: refunds.reason,
      refundAmount: refunds.refundAmount,
      reviewReason: refunds.reviewReason,
      processedAt: refunds.processedAt,
      reservationId: reservations.id,
      reservationCode: reservations.code,
      paymentId: orders.paymentId,
      customerName: customers.name,
      shopName: shops.name,
    })
    .from(refunds)
    .innerJoin(orders, eq(orders.id, refunds.orderId))
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(slots, eq(slots.id, orders.slotId))
    .innerJoin(shops, eq(shops.id, slots.shopId))
    .leftJoin(reservations, eq(reservations.id, refunds.reservationId))
    .where(reviewWhere(db))
    .orderBy(asc(refunds.createdAt), asc(refunds.id))
    .limit(ADMIN_LIST_LIMIT + 1);
  // 조건이 확인할 이유가 있는 환불만 고른다
  return toListResult(rows as RefundReviewRow[]);
}

/** 운영자 첫 화면·메뉴에 보일 건수(세 목록을 더한 것) */
export async function countPaymentIssues(db: DbReader, now: Date): Promise<number> {
  const since = stuckSince(now);
  const [[stuckOrders], [stuckCancels], [reviews]] = await Promise.all([
    db.select({ n: count() }).from(orders).where(stuckOrderWhere(since.orders)),
    db.select({ n: count() }).from(refunds).where(stuckCancelWhere(since.cancels)),
    db.select({ n: count() }).from(refunds).where(reviewWhere(db)),
  ]);
  return stuckOrders.n + stuckCancels.n + reviews.n;
}
