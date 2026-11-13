// 원장님 대시보드 매물 나누기 (O9, S-401). 화면('use client')과 서버가 같이 쓴다.
// 상태는 O1의 getSlotStatus로 계산한다(시간이 지나서 바뀌는 상태). "지금"은 서버 시각을 받는다.
// 시간대 매물(#308)도 같은 목록에 시작 순서로 섞는다. 시간대 상태는 서버가 화면을 열 때 windowStatus로 계산해 넘기고,
// 필터·숫자에서는 매물 상태 이름 6개(X-301) 중 하나로 센다(예약대기·게시중·마감).

import type { SlotCloseReason } from '@/db/schema/slots';
import { startOfKstDay } from '@/lib/time';
import {
  getSlotStatus,
  isSlotOnHold,
  SLOT_STATUS_LABELS,
  type SlotStatus,
} from '@/features/slot-status/slot-status';
import type { WindowState } from '@/server/slot-windows/types';

/** 대시보드 매물 한 줄(화면으로 넘기는 값이라 시각은 ISO 문자열) */
export type DashboardSlot = {
  kind: 'slot';
  id: string;
  /** 저장된 상태. 화면 상태는 viewStatus로 계산한다 */
  status: SlotStatus;
  startAt: string;
  endAt: string;
  publishAt: string;
  menuName: string;
  listPrice: number;
  salePrice: number;
  discountRate: number;
  newCustomerOnly: boolean;
  holdCustomerId: string | null;
  holdExpiresAt: string | null;
  /** 원장님이 직접 마감했으면 사유(S-206) */
  closeReason: SlotCloseReason | null;
  /** 시간대 매물 안에서 손님이 고른 서비스·시각으로 만든 매물이면 그 시간대(#308). 원장님이 올린 매물이면 null */
  windowId: string | null;
  /** 예약이 있는 매물(예약됨·완료·취소)이면 예약 id. 예약 상세(O11)로 간다 */
  reservationId: string | null;
  /** 예약이 있는 매물이면 예약번호 */
  reservationCode: string | null;
  /** '취소' 매물로 재등록한 새 매물(O13). 없으면 null */
  relistedSlotId: string | null;
};

/** 대시보드 시간대 매물 한 줄(#308). 안에서 들어온 예약은 매물 줄(windowId)로 따로 나온다 */
export type DashboardWindow = {
  kind: 'window';
  id: string;
  startAt: string;
  endAt: string;
  publishAt: string;
  /** windowStatus 결과(서버가 화면을 연 시각으로 계산). full은 게시중이지만 남은 시간에 들어가는 서비스가 없음 */
  state: WindowState;
  /** 원장님이 마감했으면 사유 */
  closeReason: SlotCloseReason | null;
  newCustomerOnly: boolean;
  /** 올린 서비스(메뉴 순서)와 할인율 */
  menus: { name: string; discountRate: number }[];
};

/** 대시보드 목록의 한 줄: 매물 또는 시간대 */
export type DashboardEntry = DashboardSlot | DashboardWindow;

/** 대시보드 상태 필터 순서(상태 이름 6개, X-301) */
export const DASHBOARD_STATUSES: readonly SlotStatus[] = [
  'scheduled',
  'published',
  'reserved',
  'closed',
  'cancelled',
  'completed',
];

/**
 * 시간대 상태를 매물 상태 이름으로(필터·숫자·배지). 남은 시간에 들어가는 서비스가 없는 시간대(full)도 아직 열려 있어서
 * 게시중으로 센다(줄에 "고객 목록에서 내려갔어요"를 따로 적는다)
 */
export const WINDOW_VIEW_STATUS: Record<WindowState, SlotStatus> = {
  scheduled: 'scheduled',
  published: 'published',
  full: 'published',
  closed: 'closed',
};

export { SLOT_STATUS_LABELS };

/** 매물을 나누는 날: 오늘(한국 날짜)과 내일 이후(예정) */
export type DashboardDay = 'today' | 'upcoming';

/** 탭: [전체]는 오늘·예정 두 구역을 한 화면에, [오늘]·[예정]은 그날 매물만 다 보여준다(#358) */
export type DashboardTab = 'all' | DashboardDay;

/** [전체] 탭의 구역마다 보여주는 매물 수. 넘으면 구역 아래 [더보기]로 그 탭에 간다(#358, 11/12 nnoinn) */
export const ALL_TAB_SECTION_LIMIT = 7;

/** 상태 필터 값: 상태 하나, 또는 모든 상태('all') */
export type StatusFilter = SlotStatus | 'all';

/** 한국 날짜로 내일 0시 */
export function startOfKstTomorrow(now: Date): Date {
  return new Date(startOfKstDay(now).getTime() + 24 * 60 * 60 * 1000);
}

/** 화면 상태(예: 시작이 지난 게시중 매물은 마감). 시간대는 서버가 계산한 상태를 매물 상태 이름으로 바꾼다 */
export function viewStatus(entry: DashboardEntry, now: Date): SlotStatus {
  if (entry.kind === 'window') return WINDOW_VIEW_STATUS[entry.state];
  return getSlotStatus(
    {
      status: entry.status,
      publishAt: new Date(entry.publishAt),
      startAt: new Date(entry.startAt),
    },
    now,
  );
}

/** 지금 다른 고객이 결제 중(10분 홀딩)인지. 결제 중이면 [수정]·[마감]을 잠근다 */
export function onHold(slot: DashboardSlot, now: Date): boolean {
  return isSlotOnHold(
    {
      holdCustomerId: slot.holdCustomerId,
      holdExpiresAt: slot.holdExpiresAt ? new Date(slot.holdExpiresAt) : null,
    },
    now,
  );
}

/**
 * 매물과 시간대를 한 목록으로: 시작 시각 순서, 같은 시각이면 시간대가 먼저(그 안의 예약 줄이 바로 아래에 온다)
 */
export function mergeEntries(
  slots: readonly DashboardSlot[],
  windows: readonly DashboardWindow[],
): DashboardEntry[] {
  return [...windows, ...slots].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );
}

/** 오늘(한국 날짜) 시작하는 줄과 내일 이후 줄. 오늘 0시 전에 시작한 줄은 빼고, 순서 그대로 */
export function splitByDay<T extends { startAt: string }>(
  entries: readonly T[],
  now: Date,
): Record<DashboardDay, T[]> {
  const today = startOfKstDay(now).getTime();
  const tomorrow = startOfKstTomorrow(now).getTime();
  const result: Record<DashboardDay, T[]> = { today: [], upcoming: [] };
  for (const entry of entries) {
    const start = new Date(entry.startAt).getTime();
    if (start < today) continue;
    result[start < tomorrow ? 'today' : 'upcoming'].push(entry);
  }
  return result;
}

/** 상태별 개수(필터 칸에 보여준다) */
export function countByStatus(
  entries: readonly DashboardEntry[],
  now: Date,
): Record<SlotStatus, number> {
  const counts = Object.fromEntries(DASHBOARD_STATUSES.map((status) => [status, 0])) as Record<
    SlotStatus,
    number
  >;
  for (const entry of entries) counts[viewStatus(entry, now)] += 1;
  return counts;
}

/** 상태 필터로 거른 줄. 'all'이면 그대로 */
export function filterByStatus(
  entries: readonly DashboardEntry[],
  status: StatusFilter,
  now: Date,
): DashboardEntry[] {
  return status === 'all'
    ? [...entries]
    : entries.filter((entry) => viewStatus(entry, now) === status);
}

/** [전체] 탭의 구역 하나: 상태 필터로 거른 그날 줄 수, 보여줄 앞쪽 줄, [더보기]로 넘길 남은 수 */
export type AllTabSection = {
  day: DashboardDay;
  total: number;
  shown: DashboardEntry[];
  more: number;
};

/**
 * [전체] 탭(#358): 오늘·예정 순서로 구역을 나누고, 구역마다 상태 필터로 거른 뒤 앞에서부터 limit개만 보여준다.
 * 비어 있는 구역도 돌려준다(화면이 "오늘 시작하는 매물이 없어요" 한 줄을 그린다)
 */
export function allTabSections(
  byDay: Record<DashboardDay, readonly DashboardEntry[]>,
  status: StatusFilter,
  now: Date,
  limit: number = ALL_TAB_SECTION_LIMIT,
): AllTabSection[] {
  return (['today', 'upcoming'] as const).map((day) => {
    const matched = filterByStatus(byDay[day], status, now);
    return {
      day,
      total: matched.length,
      shown: matched.slice(0, limit),
      more: Math.max(matched.length - limit, 0),
    };
  });
}
