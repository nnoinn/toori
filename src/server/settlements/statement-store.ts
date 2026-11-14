// 원장님 정산서(S-501, #129 2장, W20 ③-2): DB 읽기. 서버에서만 부른다. 정산서 만들기는 statement-view.ts가 한다.
// 정산 묶음(settlements)은 목요일 묶기 작업(W20 ③)이 지급일마다 샵 하나에 한 줄씩 만든다.

import 'server-only';

import { and, asc, desc, eq, gte, inArray, isNull, lte, max, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import {
  ownerPenalties,
  payoutAccounts,
  penaltyCollections,
  reservations,
  settlementItems,
  settlements,
} from '@/db/schema';
import type { SettlementStatus } from '@/db/schema/settlements';
import { bankName } from '@/server/policy/banks';

import type { PayoutAccountView } from './types';
import type { StoredSettlement, UnpaidPenalty } from './statement-view';

type Db = Pick<ReturnType<typeof getDb>, 'select'>;

/** 종류별 정산 줄 수 */
const countOf = (kind: string) =>
  sql<number>`(count(${settlementItems.id}) filter (where ${settlementItems.kind} = ${kind}))::int`;

/**
 * 샵의 정산 묶음과 정산 줄 합계. 지급일(period_end)이 늦은 것부터.
 * - from·to: 지급일이 그 사이(한국 날짜, 둘 다 포함)인 것만
 * - payoutDate: 그 지급일 것만(샵 하나 × 지급일 하나라 많아야 하나)
 */
export async function readShopSettlements(
  db: Db,
  input: { shopId: string; from?: string; to?: string; payoutDate?: string },
): Promise<StoredSettlement[]> {
  const rows = await db
    .select({
      id: settlements.id,
      periodStart: settlements.periodStart,
      periodEnd: settlements.periodEnd,
      status: settlements.status,
      totalBaseAmount: settlements.totalBaseAmount,
      penaltyDeducted: settlements.penaltyDeducted,
      payoutAmount: settlements.payoutAmount,
      paidAt: settlements.paidAt,
      sale: countOf('sale'),
      noShow: countOf('no_show'),
      penalty: countOf('penalty'),
      agreedCancel: countOf('agreed_cancel'),
      platformFeeTotal: sql<number>`coalesce(sum(${settlementItems.feeAmount} + ${settlementItems.feeVat}), 0)::int`,
      paymentFeeTotal: sql<number>`coalesce(sum(${settlementItems.paymentFee} + ${settlementItems.paymentFeeVat}), 0)::int`,
    })
    .from(settlements)
    .leftJoin(settlementItems, eq(settlementItems.settlementId, settlements.id))
    .where(
      and(
        eq(settlements.shopId, input.shopId),
        input.from ? gte(settlements.periodEnd, input.from) : undefined,
        input.to ? lte(settlements.periodEnd, input.to) : undefined,
        input.payoutDate ? eq(settlements.periodEnd, input.payoutDate) : undefined,
      ),
    )
    .groupBy(settlements.id)
    .orderBy(desc(settlements.periodEnd));

  return rows.map((row) => ({
    id: row.id,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    // DB의 check 제약이 정해진 값만 허용한다
    status: row.status as SettlementStatus,
    totalBaseAmount: row.totalBaseAmount,
    penaltyDeducted: row.penaltyDeducted,
    payoutAmount: row.payoutAmount,
    paidAt: row.paidAt,
    counts: {
      sale: row.sale,
      no_show: row.noShow,
      penalty: row.penalty,
      agreed_cancel: row.agreedCancel,
    },
    platformFeeTotal: row.platformFeeTotal,
    paymentFeeTotal: row.paymentFeeTotal,
  }));
}

/** 정산 묶음마다 뗀 패널티(원장님 사정 취소 예약번호와 금액). 오래된 패널티부터 */
export async function readPenaltyCollections(
  db: Db,
  settlementIds: readonly string[],
): Promise<{ settlementId: string; reservationCode: string; amount: number }[]> {
  if (settlementIds.length === 0) return [];
  return db
    .select({
      settlementId: penaltyCollections.settlementId,
      reservationCode: reservations.code,
      amount: penaltyCollections.amount,
    })
    .from(penaltyCollections)
    .innerJoin(ownerPenalties, eq(ownerPenalties.id, penaltyCollections.penaltyId))
    .innerJoin(reservations, eq(reservations.id, ownerPenalties.reservationId))
    .where(inArray(penaltyCollections.settlementId, [...settlementIds]))
    .orderBy(asc(ownerPenalties.createdAt), asc(ownerPenalties.id));
}

/**
 * 샵의 아직 다 걷지 못한 원장님 귀책 패널티와 원인 예약번호. 오래된 것부터.
 * 지급 예정 정산서의 뗄 패널티 예상에 쓴다(묶기의 readOutstandingPenalties와 같은 조건, 읽기만 해서 잠그지 않는다)
 */
export async function readUnpaidPenalties(db: Db, shopId: string): Promise<UnpaidPenalty[]> {
  return db
    .select({
      penaltyId: ownerPenalties.id,
      amount: ownerPenalties.amount,
      collectedAmount: ownerPenalties.collectedAmount,
      createdAt: ownerPenalties.createdAt,
      reservationCode: reservations.code,
    })
    .from(ownerPenalties)
    .innerJoin(reservations, eq(reservations.id, ownerPenalties.reservationId))
    .where(and(eq(ownerPenalties.shopId, shopId), isNull(ownerPenalties.fullyCollectedAt)))
    .orderBy(asc(ownerPenalties.createdAt), asc(ownerPenalties.id));
}

/** 샵의 가장 최근 정산 묶음의 지급일. 지급 예정 정산서의 기간 시작(그다음 날)에 쓴다. 없으면 null */
export async function readLastPayoutDate(db: Db, shopId: string): Promise<string | null> {
  const [row] = await db
    .select({ last: max(settlements.periodEnd) })
    .from(settlements)
    .where(eq(settlements.shopId, shopId));
  return row?.last ?? null;
}

/** 지금 등록된 정산 계좌(은행 이름과 끝 4자리만). 없으면 null */
export async function readPayoutAccount(db: Db, shopId: string): Promise<PayoutAccountView | null> {
  const [row] = await db
    .select({ bankCode: payoutAccounts.bankCode, accountLast4: payoutAccounts.accountLast4 })
    .from(payoutAccounts)
    .where(eq(payoutAccounts.shopId, shopId));
  return row ? { bankName: bankName(row.bankCode), accountLast4: row.accountLast4 } : null;
}
