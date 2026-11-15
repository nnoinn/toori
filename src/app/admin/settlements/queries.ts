// 운영자 정산 관리(A-105, W20 ④)의 조회. 이 화면에서만 쓴다.
// 정산서 한 장의 합계·거래·뗀 패널티는 원장님 정산서(S-501, '@/server/settlements')와 같은 함수를 써서 원장님이 보는 것과 같다.
// 운영자만 보는 칸(쿠폰·실제 PG 수수료)은 여기서 따로 읽는다. 투리 손익은 PG 정산 자료를 받는 기능을 만들 때 더한다.

import 'server-only';

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  lte,
  min,
  type SQL,
  sql,
} from 'drizzle-orm';

import type { getDb } from '@/db';
import {
  disputes,
  ownerPenalties,
  reservations,
  settlementItems,
  settlements,
  shops,
} from '@/db/schema';
import type { SettlementStatus } from '@/db/schema/settlements';

import { ADMIN_LIST_LIMIT, containsPattern, type ListResult, toListResult } from '../lookup';
import type { SettlementFilter, SettlementSort } from './format';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

/** 목록 한 줄(정산 묶음 하나 = 샵 하나 × 지급일 하나) */
export type SettlementRow = {
  settlementId: string;
  shopId: string;
  shopName: string;
  periodStart: string;
  /** 지급일(period_end) */
  payoutDate: string;
  itemCount: number;
  baseAmount: number;
  /** 플랫폼 수수료 + VAT + 결제 수수료 + VAT */
  feeAmount: number;
  penaltyDeducted: number;
  payoutAmount: number;
  status: SettlementStatus;
  paidAt: Date | null;
};

const ORDER: Record<SettlementSort, SQL[]> = {
  payout_old: [asc(settlements.periodEnd), asc(shops.name), asc(settlements.id)],
  payout_new: [desc(settlements.periodEnd), asc(shops.name), asc(settlements.id)],
  amount_high: [desc(settlements.payoutAmount), desc(settlements.periodEnd), asc(settlements.id)],
};

/** 정산 목록. 검색어는 샵 이름, 기간은 지급일(한국 날짜, 둘 다 포함) */
export async function selectSettlements(
  db: DbReader,
  input: {
    filter: SettlementFilter;
    sort: SettlementSort;
    query: string;
    from: string | null;
    to: string | null;
  },
): Promise<ListResult<SettlementRow>> {
  const rows = await db
    .select({
      settlementId: settlements.id,
      shopId: shops.id,
      shopName: shops.name,
      periodStart: settlements.periodStart,
      payoutDate: settlements.periodEnd,
      itemCount: settlements.itemCount,
      baseAmount: settlements.totalBaseAmount,
      feeAmount: settlements.totalFeeAmount,
      penaltyDeducted: settlements.penaltyDeducted,
      payoutAmount: settlements.payoutAmount,
      status: settlements.status,
      paidAt: settlements.paidAt,
    })
    .from(settlements)
    .innerJoin(shops, eq(shops.id, settlements.shopId))
    .where(
      and(
        input.filter === 'all' ? undefined : eq(settlements.status, input.filter),
        input.query ? ilike(shops.name, containsPattern(input.query)) : undefined,
        input.from ? gte(settlements.periodEnd, input.from) : undefined,
        input.to ? lte(settlements.periodEnd, input.to) : undefined,
      ),
    )
    .orderBy(...ORDER[input.sort])
    .limit(ADMIN_LIST_LIMIT + 1);
  // DB의 check 제약이 정해 둔 값만 허용한다
  return toListResult(rows.map((row) => ({ ...row, status: row.status as SettlementStatus })));
}

/** 샵 하나의 미수 패널티(원장님 귀책 취소 패널티 중 아직 다 걷지 못한 것) */
export type OutstandingPenaltyRow = {
  shopId: string;
  shopName: string;
  /** 다 걷지 못한 패널티 건수 */
  count: number;
  /** 남은 금액 합계 */
  remaining: number;
  /** 가장 오래된 패널티가 생긴 때 */
  oldestAt: Date;
};

/** 미수 패널티가 있는 샵. 오래된 패널티가 있는 샵부터. 다음 정산에서 떼고, 미수가 있어도 이용 제한은 없다(10/12) */
export async function selectOutstandingPenalties(db: DbReader): Promise<OutstandingPenaltyRow[]> {
  const rows = await db
    .select({
      shopId: shops.id,
      shopName: shops.name,
      count: count(),
      remaining: sql<number>`sum(${ownerPenalties.amount} - ${ownerPenalties.collectedAmount})::int`,
      oldestAt: min(ownerPenalties.createdAt),
    })
    .from(ownerPenalties)
    .innerJoin(shops, eq(shops.id, ownerPenalties.shopId))
    .where(isNull(ownerPenalties.fullyCollectedAt))
    .groupBy(shops.id)
    .orderBy(asc(min(ownerPenalties.createdAt)), asc(shops.id));
  return rows.map((row) => ({ ...row, oldestAt: row.oldestAt as Date }));
}

/** 확인 중(open) 이의제기 수. 그 거래는 결론이 날 때까지 정산하지 않는다(#350) */
export async function countOpenDisputes(db: DbReader): Promise<number> {
  const [row] = await db.select({ n: count() }).from(disputes).where(eq(disputes.status, 'open'));
  return row?.n ?? 0;
}

/** 정산서 한 장이 어느 샵·지급일 것인지. 없으면 null */
export async function selectSettlementOwner(
  db: DbReader,
  settlementId: string,
): Promise<{ shopId: string; shopName: string; payoutDate: string } | null> {
  const [row] = await db
    .select({ shopId: shops.id, shopName: shops.name, payoutDate: settlements.periodEnd })
    .from(settlements)
    .innerJoin(shops, eq(shops.id, settlements.shopId))
    .where(eq(settlements.id, settlementId));
  return row ?? null;
}

/** 운영자만 보는 거래 칸. 원장님 정산과 상관없다 */
export type SettlementItemExtra = {
  /** 이 주문에 쓴 쿠폰(투리 부담) */
  couponAmount: number;
  /** 실제 PG 수수료. PG 정산 자료가 오기 전에는 null */
  pgFeeActual: number | null;
};

/** 정산 묶음의 거래마다 운영자 칸. 예약 id로 찾는다 */
export async function selectSettlementItemExtras(
  db: DbReader,
  settlementId: string,
): Promise<Map<string, SettlementItemExtra>> {
  const rows = await db
    .select({
      reservationId: reservations.id,
      couponAmount: settlementItems.couponAmount,
      pgFeeActual: settlementItems.pgFeeActual,
    })
    .from(settlementItems)
    .innerJoin(reservations, eq(reservations.orderId, settlementItems.orderId))
    .where(eq(settlementItems.settlementId, settlementId));
  return new Map(rows.map(({ reservationId, ...extra }) => [reservationId, extra] as const));
}
