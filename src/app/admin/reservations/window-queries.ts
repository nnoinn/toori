// 운영자 매물·예약 화면의 [시간대 매물] 탭(#567, A-103). 서버에서만 부른다. 조회만 하고, 강제 마감은 샵 상세와 같은
// forceCloseWindow(#373 ④)를 쓴다. 상태는 원장님 대시보드와 같은 windowStatus(게시예정·게시중·다 참·마감)로 계산한다

import 'server-only';

import { and, asc, desc, eq, gt, ilike, inArray, lte, or, type SQL, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import { reservations, shops, slots, slotWindows } from '@/db/schema';
import type { SlotWindowStatus } from '@/db/schema/slots';
import { windowStatus } from '@/server/slot-windows/starts';
import { readOccupiedRangesByShop, readWindowMenus } from '@/server/slot-windows/store';
import type { WindowState } from '@/server/slot-windows/types';

import { ADMIN_LIST_LIMIT, containsPattern, type ListResult, toListResult } from '../lookup';
import type { WindowFilter } from './format';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

export type AdminWindowRow = {
  windowId: string;
  shopId: string;
  shopName: string;
  startAt: Date;
  endAt: Date;
  publishAt: Date;
  /** 지금 상태(windowStatus) */
  state: WindowState;
  /** 올린 서비스 수 */
  menuCount: number;
  /** 이 시간대 안에서 결제가 끝난 예약 수(취소한 예약은 빼고, 이용 완료·노쇼는 넣는다) */
  bookedCount: number;
  /** 손님이 결제 중(10분 홀딩)인 칸 수 */
  holdingCount: number;
};

/** 열린 시간대(마감하지 않음)로 저장한 것 */
const openStored = () => inArray(slotWindows.status, ['scheduled', 'published']);

/** 거르기 조건. 지금 시각으로 나눈다(windowStatus와 같은 기준, 다 참은 게시중에 들어간다) */
function windowFilterIs(filter: WindowFilter, now: Date): SQL | undefined {
  switch (filter) {
    case 'all':
      return undefined;
    case 'scheduled':
      return and(openStored(), gt(slotWindows.publishAt, now), gt(slotWindows.endAt, now));
    case 'published':
      return and(openStored(), lte(slotWindows.publishAt, now), gt(slotWindows.endAt, now));
    case 'closed':
      return or(eq(slotWindows.status, 'closed'), lte(slotWindows.endAt, now));
  }
}

/** 시간대 매물 목록(시작이 늦은 순). 샵 이름 일부로 찾는다 */
export async function selectAdminWindows(
  db: DbReader,
  input: { filter: WindowFilter; query: string; now: Date },
): Promise<ListResult<AdminWindowRow>> {
  const { now } = input;
  const rows = await db
    .select({
      windowId: slotWindows.id,
      shopId: shops.id,
      shopName: shops.name,
      startAt: slotWindows.startAt,
      endAt: slotWindows.endAt,
      publishAt: slotWindows.publishAt,
      status: slotWindows.status,
    })
    .from(slotWindows)
    .innerJoin(shops, eq(shops.id, slotWindows.shopId))
    .where(
      and(
        windowFilterIs(input.filter, now),
        input.query ? ilike(shops.name, containsPattern(input.query)) : undefined,
      ),
    )
    .orderBy(desc(slotWindows.startAt), asc(slotWindows.id))
    .limit(ADMIN_LIST_LIMIT + 1);
  const { rows: listed, hasMore } = toListResult(rows);
  if (listed.length === 0) return { rows: [], hasMore };

  const windowIds = listed.map((row) => row.windowId);
  const from = new Date(Math.min(...listed.map((row) => row.startAt.getTime())));
  const to = new Date(Math.max(...listed.map((row) => row.endAt.getTime())));
  const [menusByWindow, occupiedByShop, cells] = await Promise.all([
    readWindowMenus(db, windowIds),
    readOccupiedRangesByShop(db, { shopIds: listed.map((row) => row.shopId), from, to, now }),
    db
      .select({
        windowId: slots.windowId,
        booked:
          sql<number>`count(${reservations.id}) filter (where ${inArray(reservations.status, ['confirmed', 'completed'])})`.mapWith(
            Number,
          ),
        holding: sql<number>`count(distinct ${slots.id}) filter (where ${and(
          inArray(slots.status, ['scheduled', 'published']),
          gt(slots.holdExpiresAt, now),
        )})`.mapWith(Number),
      })
      .from(slots)
      .leftJoin(reservations, eq(reservations.slotId, slots.id))
      .where(inArray(slots.windowId, windowIds))
      .groupBy(slots.windowId),
  ]);
  const cellsByWindow = new Map(cells.map((cell) => [cell.windowId, cell]));

  return {
    hasMore,
    rows: listed.map((row) => {
      const menus = menusByWindow.get(row.windowId) ?? [];
      const cell = cellsByWindow.get(row.windowId);
      return {
        windowId: row.windowId,
        shopId: row.shopId,
        shopName: row.shopName,
        startAt: row.startAt,
        endAt: row.endAt,
        publishAt: row.publishAt,
        state: windowStatus({
          // status는 DB 제약(slot_windows_status_check)으로 세 값만 들어간다
          status: row.status as SlotWindowStatus,
          publishAt: row.publishAt,
          window: { start: row.startAt, end: row.endAt },
          menuDurations: menus.map((menu) => menu.durationMinutes),
          occupied: occupiedByShop.get(row.shopId) ?? [],
          now,
        }),
        menuCount: menus.length,
        bookedCount: cell?.booked ?? 0,
        holdingCount: cell?.holding ?? 0,
      };
    }),
  };
}
