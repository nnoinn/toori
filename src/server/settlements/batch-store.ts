// 목요일 정산 묶기: DB 읽기·저장 (X-206, #353, W20 ③). 서버에서만 부른다. 계산은 batch-rules.ts, 순서는 batch.ts.
// 시각(Date)은 sql`` 안에 직접 넣지 않고 lt처럼 칸을 거쳐 넘긴다(postgres-js가 Date를 받지 않는다, #346).

import 'server-only';

import { and, asc, desc, eq, gte, inArray, isNull, lt, not, notExists, or, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import {
  orders,
  ownerPenalties,
  penaltyCollections,
  reservations,
  settlementHolds,
  settlementItems,
  settlements,
  shops,
  slots,
} from '@/db/schema';
import { disputeHandledSince, hasOpenDispute } from '@/server/disputes/conditions';

import type { ShopSettlementDraft } from './batch-rules';
import type { OutstandingPenalty } from './calc-settlement';
import { adminHoldReleasedSince, hasAdminHold } from './hold-conditions';
import {
  cancelRefund,
  cancelRefundJoin,
  narrowSettleTarget,
  settleableReservation,
  settleTargetColumns,
} from './settle-query';
import type { SettleTarget } from './settle-rules';

type Db = Pick<ReturnType<typeof getDb>, 'select' | 'insert' | 'update'>;

/** 묶기 후보 하나: 아직 정산 줄이 없는 끝난 예약과 정산 규칙에 필요한 값 */
export type BatchCandidate = SettleTarget & {
  shopId: string;
  reservationId: string;
  orderId: string;
  salePrice: number;
  discountRate: number;
  couponAmount: number;
  hasOpenDispute: boolean;
  /**
   * 운영자 정산 보류(#373 ②): 그 거래나 그 샵에 지금 풀리지 않은 보류가 있거나, 보류가 cutoff(지급일 0시) 뒤에 풀렸다
   * (그 지급일 기준 시각에는 아직 보류 중이었다. 풀리면 돌아오는 지급일, 이의제기 결론과 같은 규칙)
   */
  hasAdminHold: boolean;
};

/**
 * 묶기 후보: 모든 샵의 정산할 수 있는 끝난 예약(settleableReservation: 이용 완료이거나 끝난 고객 취소·합의 후 취소) 중
 * 아직 정산 줄이 없고, 방문·노쇼 처리나 취소가 cutoff 전이고, cutoff 뒤에 결론이 난 이의제기가 없는 것.
 * 기한·보류(이의제기·운영자 정산 보류)는 부른 쪽이 정산 규칙으로 고른다
 */
export async function readBatchCandidates(
  db: Pick<ReturnType<typeof getDb>, 'select'>,
  input: { cutoff: Date },
): Promise<BatchCandidate[]> {
  const rows = await db
    .select({
      shopId: slots.shopId,
      reservationId: reservations.id,
      orderId: reservations.orderId,
      // 정산 규칙에 넘길 칸은 원장님 정산 내역과 같은 조각(#394 리뷰 1번)
      ...settleTargetColumns,
      salePrice: slots.salePrice,
      discountRate: slots.discountRate,
      couponAmount: orders.couponAmount,
      hasOpenDispute: sql<boolean>`${hasOpenDispute(reservations.id)}`,
      hasAdminHold: sql<boolean>`(${hasAdminHold(reservations.id, slots.shopId)} or ${adminHoldReleasedSince(reservations.id, slots.shopId, new Date('9999-12-31T00:00:00Z'))})`,
    })
    .from(reservations)
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .innerJoin(orders, eq(orders.id, reservations.orderId))
    .leftJoin(cancelRefund, cancelRefundJoin)
    .where(
      and(
        settleableReservation,
        // 지급일 기준 시각에 확인 중이었던 이의제기(그 뒤에 결론)는 그날 묶지 않는다
        not(disputeHandledSince(reservations.id, input.cutoff)),
        or(
          and(eq(reservations.status, 'completed'), lt(reservations.visitRecordedAt, input.cutoff)),
          and(eq(reservations.status, 'cancelled'), lt(reservations.cancelledAt, input.cutoff)),
        ),
        notExists(
          db
            .select({ one: sql`1` })
            .from(settlementItems)
            .where(eq(settlementItems.orderId, reservations.orderId)),
        ),
      ),
    )
    .orderBy(asc(slots.shopId), asc(reservations.id));

  return rows.map(narrowSettleTarget);
}

/**
 * 샵 하나를 묶기 전에 그 샵 줄을 잠근다(트랜잭션 안에서 부른다). 정산 보류를 거는 함수(hold-store.ts)도 같은 샵 줄을 잠가서,
 * 묶는 동안 걸린 보류는 묶기가 끝난 뒤에 걸리고(그때는 "이미 묶임"), 먼저 걸린 보류는 아래 readHeldReservationIds가 본다
 */
export async function lockShopForBatch(
  tx: Pick<ReturnType<typeof getDb>, 'select'>,
  shopId: string,
): Promise<void> {
  await tx.select({ id: shops.id }).from(shops).where(eq(shops.id, shopId)).for('share');
}

/**
 * 샵을 잠근 뒤 다시 읽는 운영자 정산 보류(후보를 읽은 뒤에 걸린 보류까지). 샵 전체 보류면 shop: true,
 * 아니면 보류 중인 거래 id. cutoff(지급일 0시) 뒤에 풀린 보류도 그 지급일에는 보류로 본다(readBatchCandidates와 같다)
 */
export async function readHeldReservationIds(
  tx: Pick<ReturnType<typeof getDb>, 'select'>,
  input: { shopId: string; reservationIds: readonly string[]; cutoff: Date },
): Promise<{ shop: boolean; reservationIds: Set<string> }> {
  const target =
    input.reservationIds.length > 0
      ? or(
          eq(settlementHolds.shopId, input.shopId),
          inArray(settlementHolds.reservationId, [...input.reservationIds]),
        )
      : eq(settlementHolds.shopId, input.shopId);
  const rows = await tx
    .select({ shopId: settlementHolds.shopId, reservationId: settlementHolds.reservationId })
    .from(settlementHolds)
    .where(
      and(
        target,
        or(
          isNull(settlementHolds.releasedAt),
          gte(settlementHolds.releasedAt, new Date('9999-12-31T00:00:00Z')),
        ),
      ),
    );
  return {
    shop: rows.some((row) => row.shopId !== null),
    reservationIds: new Set(
      rows.flatMap((row) => (row.reservationId === null ? [] : [row.reservationId])),
    ),
  };
}

/** 그 샵의 직전 정산 지급일(가장 늦은 period_end). 없으면 null(첫 정산) */
export async function readPreviousPayoutDate(
  db: Pick<ReturnType<typeof getDb>, 'select'>,
  shopId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ periodEnd: settlements.periodEnd })
    .from(settlements)
    .where(eq(settlements.shopId, shopId))
    .orderBy(desc(settlements.periodEnd))
    .limit(1);
  return row?.periodEnd ?? null;
}

/** 그 지급일에 이 샵을 이미 묶었는지(같은 날 두 번 돌아도 다시 묶지 않는다) */
export async function hasSettlementOn(
  db: Pick<ReturnType<typeof getDb>, 'select'>,
  input: { shopId: string; payoutDate: string },
): Promise<boolean> {
  const [row] = await db
    .select({ id: settlements.id })
    .from(settlements)
    .where(and(eq(settlements.shopId, input.shopId), eq(settlements.periodEnd, input.payoutDate)))
    .limit(1);
  return row !== undefined;
}

/** 그 샵의 아직 다 걷지 못한 패널티(트랜잭션 안에서 잠근다: 동시에 두 번 떼지 않게) */
export async function readOutstandingPenalties(
  tx: Pick<ReturnType<typeof getDb>, 'select'>,
  shopId: string,
): Promise<OutstandingPenalty[]> {
  return tx
    .select({
      penaltyId: ownerPenalties.id,
      amount: ownerPenalties.amount,
      collectedAmount: ownerPenalties.collectedAmount,
      createdAt: ownerPenalties.createdAt,
    })
    .from(ownerPenalties)
    .where(and(eq(ownerPenalties.shopId, shopId), isNull(ownerPenalties.fullyCollectedAt)))
    .orderBy(asc(ownerPenalties.createdAt))
    .for('update');
}

/**
 * 샵 하나의 정산 묶음·정산 줄·패널티 뗀 기록을 저장한다. 트랜잭션 안에서 부른다.
 * 같은 거래를 두 번 묶으면 settlement_items_order_id_unique, 같은 기간을 두 번 묶으면 settlements_shop_period_unique가 막는다
 */
export async function insertShopSettlement(
  tx: Db,
  input: { shopId: string; draft: ShopSettlementDraft; now: Date },
): Promise<{ settlementId: string }> {
  const { shopId, draft, now } = input;
  const [settlement] = await tx
    .insert(settlements)
    .values({
      shopId,
      periodStart: draft.periodStart,
      periodEnd: draft.periodEnd,
      itemCount: draft.itemCount,
      totalBaseAmount: draft.totalBaseAmount,
      totalFeeAmount: draft.totalFeeAmount,
      penaltyDeducted: draft.penaltyDeducted,
      payoutAmount: draft.payoutAmount,
      status: draft.status,
      // 0원 정산은 지급 요청 없이 끝낸다(payout_ref 없음)
      paidAt: draft.status === 'paid' ? now : null,
      memo: draft.memo,
    })
    .returning({ id: settlements.id });

  await tx.insert(settlementItems).values(
    draft.items.map((item) => ({
      shopId,
      orderId: item.orderId,
      kind: item.kind,
      baseAmount: item.baseAmount,
      feeRate: item.feeRate,
      feeAmount: item.feeAmount,
      feeVat: item.feeVat,
      paymentFeeRate: item.paymentFeeRate,
      paymentFee: item.paymentFee,
      paymentFeeVat: item.paymentFeeVat,
      payoutAmount: item.payoutAmount,
      // 실제 PG 수수료는 PG 정산 자료가 오면 채운다(#353)
      pgFeeActual: null,
      couponAmount: item.couponAmount,
      settlementId: settlement.id,
    })),
  );

  for (const collection of draft.collections) {
    await tx.insert(penaltyCollections).values({
      penaltyId: collection.penaltyId,
      settlementId: settlement.id,
      amount: collection.amount,
    });
    await tx
      .update(ownerPenalties)
      .set({
        collectedAmount: sql`${ownerPenalties.collectedAmount} + ${collection.amount}`,
        fullyCollectedAt: collection.fullyCollected ? now : null,
      })
      .where(eq(ownerPenalties.id, collection.penaltyId));
  }
  return { settlementId: settlement.id };
}
