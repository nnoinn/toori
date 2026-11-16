// 운영자 결제·환불 확인(#373 ①)의 읽기·저장. 서버에서만 부른다.
// 다시 시도 자체는 정리 작업과 같은 함수(sweepOneOrder, settleRequestedCancel)가 하고, 여기는 그 앞뒤 확인과 [확인함] 기록만 한다.

import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';

import type { getDb } from '@/db';
import { adminActions, type OrderStatus, orders, refunds } from '@/db/schema';
import { CANCEL_REFUND_REASONS } from '@/server/refunds/refund-store';

type Db = ReturnType<typeof getDb>;
type DbReader = Pick<Db, 'select'>;

/** [확인함]의 한 일(admin_actions.action). 이 기록이 있는 환불은 확인 목록에서 빠진다 */
export const REFUND_REVIEW_CHECK_ACTION = 'refund.review_check';

/** 주문의 지금 상태와 만든 시각. 없으면 null */
export async function readOrderState(
  db: DbReader,
  orderId: string,
): Promise<{ status: OrderStatus; createdAt: Date } | null> {
  const [row] = await db
    .select({ status: orders.status, createdAt: orders.createdAt })
    .from(orders)
    .where(eq(orders.id, orderId));
  return row ? { status: row.status as OrderStatus, createdAt: row.createdAt } : null;
}

/** 이 예약에 진행 중(requested)인 고객 취소·합의 후 취소가 있는지(나이와 상관없이) */
export async function hasRequestedCancel(db: DbReader, reservationId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: refunds.id })
    .from(refunds)
    .where(
      and(
        eq(refunds.reservationId, reservationId),
        eq(refunds.status, 'requested'),
        inArray(refunds.reason, CANCEL_REFUND_REASONS),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * 환불 줄을 잠그고(FOR UPDATE) 확인할 이유와 [확인함] 기록이 있는지 읽는다. 없는 환불이면 null.
 * 트랜잭션 안에서 부른다. 두 운영자가 동시에 눌러도 잠금 때문에 한 명만 기록한다
 */
export async function lockRefundReview(
  tx: DbReader,
  refundId: string,
): Promise<{ reviewReason: string | null; checked: boolean } | null> {
  const [row] = await tx
    .select({ reviewReason: refunds.reviewReason })
    .from(refunds)
    .where(eq(refunds.id, refundId))
    .for('update');
  if (!row) return null;
  const [checked] = await tx
    .select({ id: adminActions.id })
    .from(adminActions)
    .where(
      and(
        eq(adminActions.action, REFUND_REVIEW_CHECK_ACTION),
        eq(adminActions.targetType, 'refund'),
        eq(adminActions.targetId, refundId),
      ),
    )
    .limit(1);
  return { reviewReason: row.reviewReason, checked: Boolean(checked) };
}
