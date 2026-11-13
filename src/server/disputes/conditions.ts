// 이의제기 쿼리 조건 (A-104·X-206, #350 3장). 서버에서 쓴다.
// hasOpenDispute(): 정산 보류 조건. 보류 칸을 따로 두지 않고 "그 예약에 확인 중(open) 이의제기가 있으면 보류"로 본다.
// 운영자가 결론을 기록하면(resolved) 저절로 풀린다. 원장님 정산 내역(S-501)과 목요일 정산 묶기(W20)가 같이 쓴다

import { and, type AnyColumn, eq, exists, type SQL, sql } from 'drizzle-orm';
import { QueryBuilder } from 'drizzle-orm/pg-core';

import { disputes } from '@/db/schema';

// DB 연결 없이 조건 안의 하위 쿼리만 만든다. 실행할 때 바깥 쿼리와 같은 이름 규칙(snake_case)으로 바뀐다
const queryBuilder = new QueryBuilder({ casing: 'snake_case' });

/** 그 예약(바깥 쿼리의 예약 id 컬럼)에 확인 중(open) 이의제기가 있다 = 정산 보류 */
export function hasOpenDispute(reservationId: AnyColumn): SQL {
  return exists(
    queryBuilder
      .select({ one: sql`1` })
      .from(disputes)
      .where(and(eq(disputes.reservationId, reservationId), eq(disputes.status, 'open'))),
  );
}
