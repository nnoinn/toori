// 운영자 매물·예약 화면의 [시간대 매물] 탭과 시간대 매물 상세(#567, A-103). 서버에서만 부른다. 조회만 하고, 강제 마감은 샵 상세와 같은
// forceCloseWindow(#373 ④)를 쓴다. 상태는 원장님 대시보드와 같은 windowStatus(게시예정·게시중·다 참·마감)로 계산한다

import 'server-only';

import { and, asc, desc, eq, gt, ilike, inArray, lte, or, type SQL, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import { adminActions, adminProfiles, reservations, shops, slots, slotWindows } from '@/db/schema';
import type { ReservationStatus, VisitResult } from '@/db/schema/payments';
import type { SlotStatus, SlotWindowStatus } from '@/db/schema/slots';
import { windowStatus } from '@/server/slot-windows/starts';
import { readOccupiedRangesByShop, readWindowMenus } from '@/server/slot-windows/store';
import type { WindowMenuRow } from '@/server/slot-windows/view';
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

/** 시간대 안에서 손님이 만든 칸 하나와 그 칸의 예약 */
export type AdminWindowCell = {
  slotId: string;
  menuName: string;
  startAt: Date;
  endAt: Date;
  publishAt: Date;
  status: SlotStatus;
  holdCustomerId: string | null;
  holdExpiresAt: Date | null;
  closeReason: string | null;
  reservations: {
    reservationId: string;
    code: string;
    status: ReservationStatus;
    visitResult: VisitResult | null;
  }[];
};

/** 시간대 매물 상세(#567 2번) */
export type AdminWindowDetail = {
  windowId: string;
  shopId: string;
  shopName: string;
  startAt: Date;
  endAt: Date;
  publishAt: Date;
  newCustomerOnly: boolean;
  /** 지금 상태(목록과 같은 windowStatus) */
  state: WindowState;
  closedAt: Date | null;
  closeReason: string | null;
  createdAt: Date;
  menus: WindowMenuRow[];
  /** 시작 순 */
  cells: AdminWindowCell[];
  /** 운영자 처리 기록(시간대 강제 마감 slot.force_close, 최근 순) */
  adminActions: { action: string; memo: string | null; at: Date; adminName: string | null }[];
};

/** 시간대 매물 하나. 없으면 null */
export async function selectAdminWindowDetail(
  db: DbReader,
  input: { windowId: string; now: Date },
): Promise<AdminWindowDetail | null> {
  const { windowId, now } = input;
  const [row] = await db
    .select({
      windowId: slotWindows.id,
      shopId: shops.id,
      shopName: shops.name,
      startAt: slotWindows.startAt,
      endAt: slotWindows.endAt,
      publishAt: slotWindows.publishAt,
      status: slotWindows.status,
      newCustomerOnly: slotWindows.newCustomerOnly,
      closedAt: slotWindows.closedAt,
      closeReason: slotWindows.closeReason,
      createdAt: slotWindows.createdAt,
    })
    .from(slotWindows)
    .innerJoin(shops, eq(shops.id, slotWindows.shopId))
    .where(eq(slotWindows.id, windowId));
  if (!row) return null;

  const [menusByWindow, occupiedByShop, cellRows, actionRows] = await Promise.all([
    readWindowMenus(db, [windowId]),
    readOccupiedRangesByShop(db, {
      shopIds: [row.shopId],
      from: row.startAt,
      to: row.endAt,
      now,
    }),
    db
      .select({
        slotId: slots.id,
        menuName: slots.menuName,
        startAt: slots.startAt,
        endAt: slots.endAt,
        publishAt: slots.publishAt,
        status: slots.status,
        holdCustomerId: slots.holdCustomerId,
        holdExpiresAt: slots.holdExpiresAt,
        closeReason: slots.closeReason,
        reservationId: reservations.id,
        code: reservations.code,
        reservationStatus: reservations.status,
        visitResult: reservations.visitResult,
      })
      .from(slots)
      .innerJoin(reservations, eq(reservations.slotId, slots.id))
      .where(eq(slots.windowId, windowId))
      .orderBy(asc(slots.startAt), asc(slots.id), asc(reservations.createdAt)),
    db
      .select({
        action: adminActions.action,
        memo: adminActions.memo,
        at: adminActions.createdAt,
        adminName: adminProfiles.name,
      })
      .from(adminActions)
      .leftJoin(adminProfiles, eq(adminProfiles.userId, adminActions.adminId))
      .where(and(eq(adminActions.targetId, windowId)))
      .orderBy(desc(adminActions.createdAt), asc(adminActions.id)),
  ]);

  const cells = new Map<string, AdminWindowCell>();
  for (const cell of cellRows) {
    const current = cells.get(cell.slotId) ?? {
      slotId: cell.slotId,
      menuName: cell.menuName,
      startAt: cell.startAt,
      endAt: cell.endAt,
      publishAt: cell.publishAt,
      // DB의 check 제약이 정해 둔 값만 허용한다
      status: cell.status as SlotStatus,
      holdCustomerId: cell.holdCustomerId,
      holdExpiresAt: cell.holdExpiresAt,
      closeReason: cell.closeReason,
      reservations: [],
    };
    if (cell.reservationId && cell.code && cell.reservationStatus) {
      current.reservations.push({
        reservationId: cell.reservationId,
        code: cell.code,
        status: cell.reservationStatus as ReservationStatus,
        visitResult: cell.visitResult as VisitResult | null,
      });
    }
    cells.set(cell.slotId, current);
  }
  const menus = menusByWindow.get(windowId) ?? [];

  return {
    windowId: row.windowId,
    shopId: row.shopId,
    shopName: row.shopName,
    startAt: row.startAt,
    endAt: row.endAt,
    publishAt: row.publishAt,
    newCustomerOnly: row.newCustomerOnly,
    state: windowStatus({
      // status는 DB 제약(slot_windows_status_check)으로 세 값만 들어간다
      status: row.status as SlotWindowStatus,
      publishAt: row.publishAt,
      window: { start: row.startAt, end: row.endAt },
      menuDurations: menus.map((menu) => menu.durationMinutes),
      occupied: occupiedByShop.get(row.shopId) ?? [],
      now,
    }),
    closedAt: row.closedAt,
    closeReason: row.closeReason,
    createdAt: row.createdAt,
    menus,
    cells: [...cells.values()],
    adminActions: actionRows,
  };
}
