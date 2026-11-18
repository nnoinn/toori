// 운영자 정산 보류 쿼리 조건 (#373 ②, #433, 11/15 nnoinn). 서버에서 쓴다.
// 거래 하나(reservation_id)나 샵 전체(shop_id)에 풀리지 않은 보류가 있으면 그 거래는 묶지 않는다.
// 원장님 정산 내역(S-501)과 목요일 정산 묶기(W20)가 같은 조건을 써서, 원장님이 보는 "보류"와 실제로 빠지는 거래가 같다.
// 이의제기 보류(disputes/conditions.ts)와 같은 모양이다

import { and, type AnyColumn, eq, exists, gte, isNull, or, type SQL, sql } from 'drizzle-orm';

import type { SettlementHoldCode } from '@/server/policy/admin-notice';
import { QueryBuilder } from 'drizzle-orm/pg-core';

import { settlementHolds } from '@/db/schema';

// DB 연결 없이 조건 안의 하위 쿼리만 만든다. 실행할 때 바깥 쿼리와 같은 이름 규칙(snake_case)으로 바뀐다
const queryBuilder = new QueryBuilder({ casing: 'snake_case' });

/** 그 예약(바깥 쿼리의 예약 id 컬럼) 것이거나 그 샵(바깥 쿼리의 샵 id 컬럼) 전체 것인 보류 */
const holdOf = (reservationId: AnyColumn, shopId: AnyColumn) =>
  or(eq(settlementHolds.reservationId, reservationId), eq(settlementHolds.shopId, shopId));

/** 그 예약이나 그 샵에 풀리지 않은 운영자 보류가 있다 = 정산 보류 */
export function hasAdminHold(reservationId: AnyColumn, shopId: AnyColumn): SQL {
  return exists(
    queryBuilder
      .select({ one: sql`1` })
      .from(settlementHolds)
      .where(and(holdOf(reservationId, shopId), isNull(settlementHolds.releasedAt))),
  );
}

/**
 * 그 예약이나 그 샵에 풀리지 않은 운영자 보류의 사유 코드(원장님에게 보여 줄 것, #489). 없으면 null(= 보류 아님).
 * 거래 보류와 샵 전체 보류가 같이 있으면 거래 보류의 코드를 준다(#499)
 */
export function adminHoldCode(
  reservationId: AnyColumn,
  shopId: AnyColumn,
): SQL<SettlementHoldCode | null> {
  return sql<SettlementHoldCode | null>`(${queryBuilder
    .select({ code: settlementHolds.reasonCode })
    .from(settlementHolds)
    .where(and(holdOf(reservationId, shopId), isNull(settlementHolds.releasedAt)))
    .orderBy(sql`${settlementHolds.reservationId} is null`)
    .limit(1)})`;
}

/**
 * 그 예약이나 그 샵의 보류가 since(지급일 0시) 뒤에 풀렸다 = 그 지급일 기준 시각에는 아직 보류 중이었다.
 * 목요일 묶기가 그 지급일에 넣지 않는다(풀리면 돌아오는 지급일, 정산 내역의 지급 예정일과 같다. 이의제기 결론과 같은 규칙).
 * 시각은 sql`` 안에 직접 넣지 않고 gte로 넘긴다(#346)
 */
export function adminHoldReleasedSince(
  reservationId: AnyColumn,
  shopId: AnyColumn,
  since: Date,
): SQL {
  return exists(
    queryBuilder
      .select({ one: sql`1` })
      .from(settlementHolds)
      .where(and(holdOf(reservationId, shopId), gte(settlementHolds.releasedAt, since))),
  );
}
