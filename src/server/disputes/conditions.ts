// 이의제기 쿼리 조건 (A-104·X-206, #350 3장). 서버에서 쓴다.
// hasOpenDispute(): 정산 보류 조건. 보류 칸을 따로 두지 않고 "그 예약에 확인 중(open) 이의제기가 있으면 보류"로 본다.
// 운영자가 결론을 기록하면(resolved) 저절로 풀린다. 원장님 정산 내역(S-501)과 목요일 정산 묶기(W20)가 같이 쓴다

import { and, type AnyColumn, eq, exists, gte, type SQL, sql } from 'drizzle-orm';
import { QueryBuilder } from 'drizzle-orm/pg-core';

import { disputes } from '@/db/schema';

// DB 연결 없이 조건 안의 하위 쿼리만 만든다. 실행할 때 바깥 쿼리와 같은 이름 규칙(snake_case)으로 바뀐다
const queryBuilder = new QueryBuilder({ casing: 'snake_case' });

/** 확인 중(open) 이의제기 중 그 예약(바깥 쿼리의 예약 id 컬럼) 것 */
const openDisputeOf = (reservationId: AnyColumn) =>
  and(eq(disputes.reservationId, reservationId), eq(disputes.status, 'open'));

/** 그 예약(바깥 쿼리의 예약 id 컬럼)에 확인 중(open) 이의제기가 있다 = 정산 보류 */
export function hasOpenDispute(reservationId: AnyColumn): SQL {
  return exists(
    queryBuilder
      .select({ one: sql`1` })
      .from(disputes)
      .where(openDisputeOf(reservationId)),
  );
}

/** 그 예약의 확인 중 이의제기를 받은 시각(여럿이면 가장 이른 것). 없으면 null. 정산 내역의 보류 이유에 쓴다(#129) */
export function openDisputeReceivedAt(reservationId: AnyColumn): SQL<Date | null> {
  return sql<Date | null>`(${queryBuilder
    .select({ receivedAt: sql`min(${disputes.receivedAt})` })
    .from(disputes)
    .where(openDisputeOf(reservationId))})`.mapWith(disputes.receivedAt);
}

/**
 * 그 예약에 since(지급일 0시) 뒤에 결론이 난 이의제기가 있다 = 그 지급일 기준 시각에는 아직 확인 중이었다.
 * 목요일 묶기가 그 지급일에 넣지 않는다(결론이 나면 돌아오는 지급일, 정산 내역의 지급 예정일과 같다, #394 리뷰 3번).
 * 시각은 sql`` 안에 직접 넣지 않고 gte로 넘긴다(#346)
 */
export function disputeHandledSince(reservationId: AnyColumn, since: Date): SQL {
  return exists(
    queryBuilder
      .select({ one: sql`1` })
      .from(disputes)
      .where(and(eq(disputes.reservationId, reservationId), gte(disputes.handledAt, since))),
  );
}
