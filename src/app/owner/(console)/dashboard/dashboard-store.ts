// 원장님 대시보드 조회 (DB, O9, S-401, #21 Q12). 이 화면에서만 쓰는 서버 코드라 화면 폴더에 둔다.
// 모든 조회는 shopId로 그 샵 매물만 본다. 예약자 정보(닉네임·연락처)는 여기서 읽지 않는다(예약 상세 O11).
// 시간대 매물(#308)도 같이 읽는다. 시간대의 서비스와 이미 찬 시간은 강규민 시간대 읽기(server/slot-windows/store)를 같이 쓴다.
// 매물 줄은 원장님이 올린 매물과 결제가 끝난 시간대 칸만 보인다(ownerListedSlot, WINDOW-08). 손님이 결제 중인 시간대 칸은
// 마감한 시간대에 남아 있으면 그 시간대 줄에서 알린다(keptSlots, WINDOW-06).

import 'server-only';

import { and, asc, eq, gte, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { getDb } from '@/db';
import { reservations, slots, slotWindows } from '@/db/schema';
import type { SlotCloseReason, SlotStatus, SlotWindowStatus } from '@/db/schema/slots';
import { windowStatus } from '@/server/slot-windows';
import { readOccupiedRanges, readWindowMenus } from '@/server/slot-windows/store';
import { ownerListedSlot } from '@/server/slots/visibility';

import type { DashboardSlot, DashboardWindow, KeptSlotSummary } from './dashboard';

type Db = Pick<ReturnType<typeof getDb>, 'select'>;

/** 이 매물로 재등록한 새 매물(O13). '취소' 매물 줄에 [재등록]·"재등록함"을 고른다 */
const relisted = alias(slots, 'relisted');

const slotColumns = {
  id: slots.id,
  status: slots.status,
  startAt: slots.startAt,
  endAt: slots.endAt,
  publishAt: slots.publishAt,
  menuName: slots.menuName,
  listPrice: slots.listPrice,
  salePrice: slots.salePrice,
  discountRate: slots.discountRate,
  newCustomerOnly: slots.newCustomerOnly,
  holdCustomerId: slots.holdCustomerId,
  holdExpiresAt: slots.holdExpiresAt,
  closeReason: slots.closeReason,
  windowId: slots.windowId,
  reservationId: reservations.id,
  reservationCode: reservations.code,
  relistedSlotId: relisted.id,
};

/** 왼쪽 조인이라 없으면 null인 칸 */
type JoinedKey = 'reservationId' | 'reservationCode' | 'relistedSlotId';

type SlotRow = {
  [K in keyof typeof slotColumns]: K extends JoinedKey
    ? string | null
    : (typeof slots.$inferSelect)[Exclude<K, JoinedKey>];
};

/** DB 줄을 대시보드 값(DashboardSlot)으로: 시각은 ISO 문자열로 바꾸고 상태·마감 사유 타입을 좁힌다 */
function toDashboardSlot(row: SlotRow): DashboardSlot {
  return {
    kind: 'slot',
    ...row,
    // status는 DB 제약(slots_status_check)으로 여섯 값만 들어간다
    status: row.status as SlotStatus,
    // 마감 사유는 DB 제약(slots_close_reason_check)으로 SLOT_CLOSE_REASONS 값만 들어간다
    closeReason: row.closeReason as SlotCloseReason | null,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    publishAt: row.publishAt.toISOString(),
    holdExpiresAt: row.holdExpiresAt?.toISOString() ?? null,
  };
}

/**
 * from(오늘 0시) 이후에 시작하는 그 샵 매물(전체·오늘·예정 탭). 시작 시각 순서.
 * 시간대 안에서 손님이 만든 칸은 결제가 끝난 것(예약됨·완료·취소)만 보인다. 손님이 아직 결제 중인 칸과 결제 없이 비운 칸
 * (hold_released)은 원장님이 올린 매물이 아니라서 공통 조건 ownerListedSlot으로 뺀다(#308 ③④, WINDOW-08).
 * 원장님이 올린 매물은 손님이 결제 중이어도 그대로 보인다("다른 고객이 결제 중" 배지)
 */
export async function selectDashboardSlots(
  db: Db,
  shopId: string,
  from: Date,
): Promise<DashboardSlot[]> {
  const rows = await db
    .select(slotColumns)
    .from(slots)
    .leftJoin(reservations, eq(reservations.slotId, slots.id))
    .leftJoin(relisted, eq(relisted.relistedFromSlotId, slots.id))
    .where(and(eq(slots.shopId, shopId), gte(slots.startAt, from), ownerListedSlot()))
    .orderBy(asc(slots.startAt));
  return rows.map(toDashboardSlot);
}

/**
 * "처리 필요"(#21 Q12): 시작 시각이 지났는데 방문·노쇼를 기록하지 않은 예정 예약. 날짜와 상관없이 오래된 것부터.
 * 자동으로 처리하지 않고 원장님이 처리할 때까지 계속 보여준다(정산 기준일까지 안 되면 운영자가 확인)
 */
export async function selectNeedsVisitRecord(
  db: Db,
  shopId: string,
  now: Date,
): Promise<DashboardSlot[]> {
  const rows = await db
    .select(slotColumns)
    .from(slots)
    .innerJoin(reservations, eq(reservations.slotId, slots.id))
    .leftJoin(relisted, eq(relisted.relistedFromSlotId, slots.id))
    .where(
      and(
        eq(slots.shopId, shopId),
        lte(slots.startAt, now),
        eq(reservations.status, 'confirmed'),
        isNull(reservations.visitResult),
      ),
    )
    .orderBy(asc(slots.startAt));
  return rows.map(toDashboardSlot);
}

/**
 * from(오늘 0시) 이후에 시작하는 그 샵 시간대 매물(#308). 시작 시각 순서. 마감한 시간대도 보여준다(매물 마감과 같다).
 * 상태는 지금(now) 기준 windowStatus: 게시 전이면 예약대기, 남은 시간에 들어가는 서비스가 없으면 full, 끝났거나 마감했으면 마감.
 * 이미 찬 시간은 그 샵의 예약대기·게시중·예약됨 매물이다(결제 없이 끝난 홀딩 칸은 비어 있는 것으로 본다).
 * 원장님이 마감한 시간대에는 손님이 결제 중이라 남긴 칸(keptSlots)을 같이 준다. 결제하면 예약 줄로 옮겨 가고, 결제 없이 끝나면
 * 결제 정리 작업(10분마다)이 닫아서 빠진다
 */
export async function selectDashboardWindows(
  db: Db,
  shopId: string,
  from: Date,
  now: Date,
): Promise<DashboardWindow[]> {
  const rows = await db
    .select({
      id: slotWindows.id,
      startAt: slotWindows.startAt,
      endAt: slotWindows.endAt,
      publishAt: slotWindows.publishAt,
      status: slotWindows.status,
      closeReason: slotWindows.closeReason,
      newCustomerOnly: slotWindows.newCustomerOnly,
    })
    .from(slotWindows)
    .where(and(eq(slotWindows.shopId, shopId), gte(slotWindows.startAt, from)))
    .orderBy(asc(slotWindows.startAt));
  if (rows.length === 0) return [];

  const to = new Date(Math.max(...rows.map((row) => row.endAt.getTime())));
  const [menusByWindow, occupied, keptByWindow] = await Promise.all([
    readWindowMenus(
      db,
      rows.map((row) => row.id),
    ),
    readOccupiedRanges(db, { shopId, from, to, now }),
    selectKeptSlots(
      db,
      shopId,
      rows.filter((row) => row.status === 'closed').map((row) => row.id),
    ),
  ]);
  return rows.map((row) => {
    const menus = menusByWindow.get(row.id) ?? [];
    return {
      kind: 'window',
      id: row.id,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      publishAt: row.publishAt.toISOString(),
      state: windowStatus({
        // status는 DB 제약(slot_windows_status_check)으로 세 값만 들어간다
        status: row.status as SlotWindowStatus,
        publishAt: row.publishAt,
        window: { start: row.startAt, end: row.endAt },
        menuDurations: menus.map((menu) => menu.durationMinutes),
        occupied,
        now,
      }),
      closeReason: row.closeReason as SlotCloseReason | null,
      newCustomerOnly: row.newCustomerOnly,
      menus: menus.map((menu) => ({ name: menu.name, discountRate: menu.discountRate })),
      keptSlots: keptByWindow.get(row.id) ?? [],
    };
  });
}

/**
 * 원장님이 마감한 시간대(closedWindowIds)마다 손님이 결제 중이라 남긴 칸. 시작 시각 순서.
 * 마감(closeWindow)이 남기는 칸과 같은 조건이다: 시간대 안에서 홀딩으로 만든 게시중 칸(홀딩이 살아 있거나 결제 확인을 기다리는 칸).
 * 홀딩이 끝났는데 결제 정리 작업이 아직 닫지 않은 칸도 닫힐 때까지는 남아 있는 것으로 보여준다
 */
async function selectKeptSlots(
  db: Db,
  shopId: string,
  closedWindowIds: string[],
): Promise<Map<string, KeptSlotSummary[]>> {
  const byWindow = new Map<string, KeptSlotSummary[]>();
  if (closedWindowIds.length === 0) return byWindow;
  const rows = await db
    .select({
      windowId: slots.windowId,
      startAt: slots.startAt,
      endAt: slots.endAt,
      menuName: slots.menuName,
    })
    .from(slots)
    .where(
      and(
        eq(slots.shopId, shopId),
        inArray(slots.windowId, closedWindowIds),
        eq(slots.status, 'published'),
        isNotNull(slots.holdExpiresAt),
      ),
    )
    .orderBy(asc(slots.startAt));
  for (const row of rows) {
    // where에서 그 시간대들 안의 칸만 골라서 window_id가 늘 있다
    const windowId = row.windowId!;
    const kept = byWindow.get(windowId) ?? [];
    kept.push({
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      menuName: row.menuName,
    });
    byWindow.set(windowId, kept);
  }
  return byWindow;
}
