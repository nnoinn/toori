// 원장님 월별 통계(S-504)의 살린 시간 조회. 서버에서만 부른다.
// 그 샵 예약 중 방문 완료로 처리했고(방문 처리 시각이 기간 안) 무효가 아닌 것만 날마다(방문 처리일, 한국 날짜) 센다.
// 노쇼·취소는 빼고, 시간대 매물에서 생긴 예약도 매물 한 칸이라 같이 센다. 시술 시간은 매물의 시작~끝이다.
// 정산 내역의 '이용 완료' 줄과 같은 예약이다(완료·방문·무효 아님·처리 시각 기준)

import 'server-only';

import { and, asc, eq, gte, isNull, lt, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import { reservations, slots } from '@/db/schema';
import { KST_TIME_ZONE } from '@/lib/time';

import type { VisitDay } from './stats';

/** 방문 처리일(한국 날짜 'YYYY-MM-DD'). 묶기와 순서에 같은 식을 쓴다 */
const visitDay = sql<string>`to_char(${reservations.visitRecordedAt} at time zone ${sql.raw(`'UTC'`)}, 'YYYY-MM-DD')`;

/** 기간 [from, to) 안에 방문 완료로 처리한 예약 수와 시술 시간 합(분)을 날마다. 없는 날은 주지 않는다 */
export async function selectVisitDays(
  db: Pick<ReturnType<typeof getDb>, 'select'>,
  shopId: string,
  period: { from: Date; to: Date },
): Promise<VisitDay[]> {
  return db
    .select({
      dateKey: visitDay,
      visitCount: sql<number>`count(*)::int`,
      minutes: sql<number>`(max(extract(epoch from (${slots.endAt} - ${slots.startAt}))) / 60)::int`,
    })
    .from(reservations)
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .where(
      and(
        eq(slots.shopId, shopId),
        eq(reservations.status, 'completed'),
        eq(reservations.visitResult, 'visited'),
        isNull(reservations.voidedAt),
        gte(reservations.visitRecordedAt, period.from),
        lt(reservations.visitRecordedAt, period.to),
      ),
    )
    .groupBy(visitDay)
    .orderBy(asc(visitDay));
}
