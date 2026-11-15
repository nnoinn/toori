// 정산 규칙(settle-rules.ts)에 넘길 예약 값을 읽는 SQL 조각 (X-206, #394 리뷰 1·2번). 서버에서만 부른다.
// 원장님 정산 내역(settlement-store.ts)과 목요일 묶기(batch-store.ts)가 같은 조각을 써서,
// 한쪽만 바뀌어 원장님이 보는 금액과 실제로 묶이는 금액이 달라지는 일이 없게 한다.

import 'server-only';

import { and, eq, inArray, isNotNull, not, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { refunds, reservations, slots } from '@/db/schema';
import type { CancelActor, ReservationStatus, VisitResult } from '@/db/schema/payments';

/** 고객 취소·합의 후 취소의 끝난 환불 기록(한 예약에 하나, refunds_cancel_unique). leftJoin(cancelRefund, cancelRefundJoin) */
export const cancelRefund = alias(refunds, 'cancel_refund');

export const cancelRefundJoin = and(
  eq(cancelRefund.reservationId, reservations.id),
  inArray(cancelRefund.reason, ['customer_cancel', 'agreed_cancel']),
  eq(cancelRefund.status, 'done'),
);

/** 운영자 취소 환불(admin_exception)이 있는 예약. 원장님 기준 금액이 0이다(기술 가이드 7장 "앱을 거치지 않은 취소") */
export const hasAdminRefund = sql<boolean>`exists (select 1 from ${refunds} where ${refunds.reservationId} = ${reservations.id} and ${refunds.reason} = 'admin_exception')`;

/** 정산 규칙(SettleTarget)에 필요한 칸. reservations·slots를 조인하고 cancelRefund를 leftJoin한 쿼리에서 쓴다 */
export const settleTargetColumns = {
  status: reservations.status,
  visitResult: reservations.visitResult,
  visitRecordedAt: reservations.visitRecordedAt,
  cancelledAt: reservations.cancelledAt,
  cancelActor: reservations.cancelActor,
  startAt: slots.startAt,
  cancelPenaltyRate: cancelRefund.penaltyRate,
  hasAdminRefund,
};

/** DB의 check 제약이 정해 둔 값만 허용하는 칸을 좁힌다 */
export function narrowSettleTarget<
  T extends { status: string; visitResult: string | null; cancelActor: string | null },
>(
  row: T,
): Omit<T, 'status' | 'visitResult' | 'cancelActor'> & {
  status: ReservationStatus;
  visitResult: VisitResult | null;
  cancelActor: CancelActor | null;
} {
  return {
    ...row,
    status: row.status as ReservationStatus,
    visitResult: row.visitResult as VisitResult | null,
    cancelActor: row.cancelActor as CancelActor | null,
  };
}

/**
 * 정산 줄을 만들 수 있는 예약(정산 규칙 settlementKindOf와 같은 조건을 SQL로):
 * 방문·노쇼 처리된 이용 완료이거나, 끝난 고객 취소·합의 후 취소 환불이 있는 취소. 운영자 취소 환불이 있으면 뺀다.
 * 원장님 사정 취소·자동 취소·운영자 취소는 정산 줄이 없어서 묶기 후보에서 뺀다(#394 리뷰 2번, 읽는 줄이 계속 늘지 않게)
 */
export const settleableReservation = and(
  or(
    and(
      eq(reservations.status, 'completed'),
      inArray(reservations.visitResult, ['visited', 'no_show']),
    ),
    and(
      eq(reservations.status, 'cancelled'),
      inArray(reservations.cancelActor, ['customer', 'agreed']),
      isNotNull(cancelRefund.penaltyRate),
    ),
  ),
  not(hasAdminRefund),
);
