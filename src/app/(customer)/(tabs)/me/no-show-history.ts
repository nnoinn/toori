// 내 노쇼 기록 조회 (C-105). 내 정보에서만 쓰는 서버 코드라 화면 폴더에 둔다.
// 원장님이 노쇼로 처리한 내 예약(visit_result = 'no_show', S-405)만 센다. 본인 것만 본다(X-102).
// DB를 받아서 테스트(withRollback)에서도 같은 조회를 쓸 수 있게 했다.

import 'server-only';

import { and, count, desc, eq } from 'drizzle-orm';

import type { getDb } from '@/db';
import { reservations, shops, slots } from '@/db/schema';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

export type NoShowHistory = {
  count: number;
  /** 서비스 시작 시각이 가장 늦은 노쇼. 없으면 null */
  latest: {
    reservationId: string;
    shopName: string;
    /** ISO */
    startAt: string;
  } | null;
};

/** 그 고객의 노쇼 수와 가장 최근 노쇼 */
export async function selectMyNoShows(db: DbReader, customerId: string): Promise<NoShowHistory> {
  const mine = and(
    eq(reservations.customerId, customerId),
    eq(reservations.visitResult, 'no_show'),
  );

  const [{ total }] = await db.select({ total: count() }).from(reservations).where(mine);
  if (total === 0) return { count: 0, latest: null };

  const [latest] = await db
    .select({ reservationId: reservations.id, shopName: shops.name, startAt: slots.startAt })
    .from(reservations)
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .innerJoin(shops, eq(shops.id, slots.shopId))
    .where(mine)
    .orderBy(desc(slots.startAt), desc(reservations.id))
    .limit(1);

  return {
    count: total,
    latest: latest ? { ...latest, startAt: latest.startAt.toISOString() } : null,
  };
}
