// 원장님 정산 내역: DB 읽기 (S-501·S-502, #129, W20). 서버에서만 부른다. 줄 만들기와 합계는 settlement-view.ts가 한다.
// 시각(Date)은 sql`` 안에 직접 넣지 않고 gte·lt처럼 칸을 거쳐 넘긴다(postgres-js가 Date를 받지 않는다, #346).

import 'server-only';

import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { getDb } from '@/db';
import {
  orders,
  ownerPenalties,
  refunds,
  reservations,
  settlementItems,
  settlements,
  slots,
} from '@/db/schema';
import type { CancelActor, ReservationStatus, VisitResult } from '@/db/schema/payments';
import type { SettlementItemKind, SettlementStatus } from '@/db/schema/settlements';
import { hasOpenDispute, openDisputeReceivedAt } from '@/server/disputes/conditions';

import type { SettlementRow } from './settlement-view';

type Db = Pick<ReturnType<typeof getDb>, 'select'>;

/** 고객 취소·합의 후 취소의 끝난 환불 기록(한 예약에 하나, refunds_cancel_unique) */
const cancelRefund = alias(refunds, 'cancel_refund');

/**
 * 샵의 끝난 예약(이용 완료·취소)과 정산에 필요한 값.
 * - occurred: 방문·노쇼 처리 또는 취소 시각이 [from, to)인 예약만
 * - unpaidOnly: 아직 지급하지 않은 예약만(묶이지 않았거나, 묶음이 지급 전·지급 요청 상태)
 */
export async function readShopSettlementRows(
  db: Db,
  input: { shopId: string; occurred?: { from: Date; to: Date }; unpaidOnly?: boolean },
): Promise<SettlementRow[]> {
  const { occurred } = input;
  const rows = await db
    .select({
      reservationId: reservations.id,
      reservationCode: reservations.code,
      status: reservations.status,
      visitResult: reservations.visitResult,
      visitRecordedAt: reservations.visitRecordedAt,
      cancelledAt: reservations.cancelledAt,
      cancelActor: reservations.cancelActor,
      startAt: slots.startAt,
      menuName: slots.menuName,
      listPrice: slots.listPrice,
      salePrice: slots.salePrice,
      discountRate: slots.discountRate,
      couponUsed: sql<boolean>`${orders.couponId} is not null`,
      cancelPenaltyRate: cancelRefund.penaltyRate,
      hasAdminRefund: sql<boolean>`exists (select 1 from ${refunds} where ${refunds.reservationId} = ${reservations.id} and ${refunds.reason} = 'admin_exception')`,
      // 확인 중 이의제기가 있으면 정산 보류(#350 3장, 이의제기 쪽 조건 하나를 같이 쓴다)
      hasOpenDispute: sql<boolean>`${hasOpenDispute(reservations.id)}`,
      openDisputeReceivedAt: openDisputeReceivedAt(reservations.id),
      // 원장님 귀책 취소 패널티(예약 하나에 하나, owner_penalties_reservation_id_unique)
      penaltyAmount: ownerPenalties.amount,
      penaltyCollected: ownerPenalties.collectedAmount,
      itemId: settlementItems.id,
      itemKind: settlementItems.kind,
      baseAmount: settlementItems.baseAmount,
      feeRate: settlementItems.feeRate,
      feeAmount: settlementItems.feeAmount,
      feeVat: settlementItems.feeVat,
      paymentFeeRate: settlementItems.paymentFeeRate,
      paymentFee: settlementItems.paymentFee,
      paymentFeeVat: settlementItems.paymentFeeVat,
      payoutAmount: settlementItems.payoutAmount,
      settlementStatus: settlements.status,
      payoutDate: settlements.periodEnd,
    })
    .from(reservations)
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .innerJoin(orders, eq(orders.id, reservations.orderId))
    .leftJoin(ownerPenalties, eq(ownerPenalties.reservationId, reservations.id))
    .leftJoin(
      cancelRefund,
      and(
        eq(cancelRefund.reservationId, reservations.id),
        inArray(cancelRefund.reason, ['customer_cancel', 'agreed_cancel']),
        eq(cancelRefund.status, 'done'),
      ),
    )
    .leftJoin(settlementItems, eq(settlementItems.orderId, reservations.orderId))
    .leftJoin(settlements, eq(settlements.id, settlementItems.settlementId))
    .where(
      and(
        eq(slots.shopId, input.shopId),
        inArray(reservations.status, ['completed', 'cancelled']),
        occurred
          ? or(
              and(
                eq(reservations.status, 'completed'),
                gte(reservations.visitRecordedAt, occurred.from),
                lt(reservations.visitRecordedAt, occurred.to),
              ),
              and(
                eq(reservations.status, 'cancelled'),
                gte(reservations.cancelledAt, occurred.from),
                lt(reservations.cancelledAt, occurred.to),
              ),
            )
          : undefined,
        input.unpaidOnly
          ? or(isNull(settlements.id), inArray(settlements.status, ['pending', 'requested']))
          : undefined,
      ),
    )
    .orderBy(desc(sql`coalesce(${reservations.visitRecordedAt}, ${reservations.cancelledAt})`));

  return rows.map((row) => ({
    reservationId: row.reservationId,
    reservationCode: row.reservationCode,
    // DB의 check 제약이 정해진 값만 허용한다
    status: row.status as ReservationStatus,
    visitResult: row.visitResult as VisitResult | null,
    visitRecordedAt: row.visitRecordedAt,
    cancelledAt: row.cancelledAt,
    cancelActor: row.cancelActor as CancelActor | null,
    startAt: row.startAt,
    menuName: row.menuName,
    listPrice: row.listPrice,
    salePrice: row.salePrice,
    discountRate: row.discountRate,
    couponUsed: row.couponUsed,
    cancelPenaltyRate: row.cancelPenaltyRate,
    hasAdminRefund: row.hasAdminRefund,
    hasOpenDispute: row.hasOpenDispute,
    openDisputeReceivedAt: row.openDisputeReceivedAt,
    ownerPenalty:
      row.penaltyAmount === null || row.penaltyCollected === null
        ? null
        : { amount: row.penaltyAmount, collectedAmount: row.penaltyCollected },
    item:
      row.itemId === null
        ? null
        : {
            kind: row.itemKind as SettlementItemKind,
            baseAmount: row.baseAmount as number,
            feeRate: row.feeRate as number,
            feeAmount: row.feeAmount as number,
            feeVat: row.feeVat as number,
            paymentFeeRate: row.paymentFeeRate as number,
            paymentFee: row.paymentFee as number,
            paymentFeeVat: row.paymentFeeVat as number,
            payoutAmount: row.payoutAmount as number,
            settlement:
              row.settlementStatus === null || row.payoutDate === null
                ? null
                : {
                    status: row.settlementStatus as SettlementStatus,
                    payoutDate: row.payoutDate,
                  },
          },
  }));
}

/** 샵의 아직 다 걷지 못한 원장님 귀책 취소 패널티 합계 */
export async function readOutstandingPenalty(db: Db, shopId: string): Promise<number> {
  const [row] = await db
    .select({
      remaining: sql<number>`coalesce(sum(${ownerPenalties.amount} - ${ownerPenalties.collectedAmount}), 0)::int`,
    })
    .from(ownerPenalties)
    .where(and(eq(ownerPenalties.shopId, shopId), isNull(ownerPenalties.fullyCollectedAt)));
  return row?.remaining ?? 0;
}
