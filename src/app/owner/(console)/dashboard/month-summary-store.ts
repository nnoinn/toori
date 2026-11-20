// 대시보드 "이번 달 투리" 카드(S-504)의 살린 시간 조회. 서버에서만 부른다.
// 그 샵 예약 중 방문 완료로 처리했고(방문 처리 시각이 기간 안) 무효가 아닌 것만 센다. 노쇼·취소는 빼고,
// 시간대 매물에서 생긴 예약도 매물 한 칸이라 같이 센다. 시술 시간은 매물의 시작~끝이다

import 'server-only';

import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import { reservations, slots } from '@/db/schema';

import type { MonthVisitTime } from './month-summary';

/** 기간 [from, to) 안에 방문 완료로 처리한 예약 수와 시술 시간 합(분) */
export async function selectMonthVisitTime(
  db: Pick<ReturnType<typeof getDb>, 'select'>,
  shopId: string,
  period: { from: Date; to: Date },
): Promise<MonthVisitTime> {
  const [row] = await db
    .select({
      visitCount: sql<number>`count(*)::int`,
      minutes: sql<number>`coalesce(sum(extract(epoch from (${slots.endAt} - ${slots.startAt})) / 60), 0)::int`,
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
    );
  return { visitCount: row?.visitCount ?? 0, minutes: row?.minutes ?? 0 };
}
