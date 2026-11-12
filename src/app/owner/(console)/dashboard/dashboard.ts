// 원장님 대시보드 매물 나누기 (O9, S-401). 화면('use client')과 서버가 같이 쓴다.
// 상태는 O1의 getSlotStatus로 계산한다(시간이 지나서 바뀌는 상태). "지금"은 서버 시각을 받는다.

import type { SlotCloseReason } from '@/db/schema/slots';
import { startOfKstDay } from '@/lib/time';
import {
  getSlotStatus,
  isSlotOnHold,
  SLOT_STATUS_LABELS,
  type SlotStatus,
} from '@/features/slot-status/slot-status';

/** 대시보드 매물 한 줄(화면으로 넘기는 값이라 시각은 ISO 문자열) */
export type DashboardSlot = {
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
  /** 예약이 있는 매물(예약됨·완료·취소)이면 예약 id. 예약 상세(O11)로 간다 */
  reservationId: string | null;
  /** 예약이 있는 매물이면 예약번호 */
  reservationCode: string | null;
  /** '취소' 매물로 재등록한 새 매물(O13). 없으면 null */
  relistedSlotId: string | null;
};

/** 대시보드 상태 필터 순서(상태 이름 6개, X-301) */
export const DASHBOARD_STATUSES: readonly SlotStatus[] = [
  'scheduled',
  'published',
  'reserved',
  'closed',
  'cancelled',
  'completed',
];

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

/** 화면 상태(예: 시작이 지난 게시중 매물은 마감) */
export function viewStatus(slot: DashboardSlot, now: Date): SlotStatus {
  return getSlotStatus(
    { status: slot.status, publishAt: new Date(slot.publishAt), startAt: new Date(slot.startAt) },
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

/** 오늘(한국 날짜) 시작하는 매물과 내일 이후 매물. 오늘 0시 전에 시작한 매물은 빼고, 시작 시각 순서 그대로 */
export function splitByDay(
  slots: DashboardSlot[],
  now: Date,
): Record<DashboardDay, DashboardSlot[]> {
  const today = startOfKstDay(now).getTime();
  const tomorrow = startOfKstTomorrow(now).getTime();
  const result: Record<DashboardDay, DashboardSlot[]> = { today: [], upcoming: [] };
  for (const slot of slots) {
    const start = new Date(slot.startAt).getTime();
    if (start < today) continue;
    result[start < tomorrow ? 'today' : 'upcoming'].push(slot);
  }
  return result;
}

/** 상태별 개수(필터 칸에 보여준다) */
export function countByStatus(slots: DashboardSlot[], now: Date): Record<SlotStatus, number> {
  const counts = Object.fromEntries(DASHBOARD_STATUSES.map((status) => [status, 0])) as Record<
    SlotStatus,
    number
  >;
  for (const slot of slots) counts[viewStatus(slot, now)] += 1;
  return counts;
}

/** 상태 필터로 거른 매물. 'all'이면 그대로 */
export function filterByStatus(
  slots: DashboardSlot[],
  status: StatusFilter,
  now: Date,
): DashboardSlot[] {
  return status === 'all' ? slots : slots.filter((slot) => viewStatus(slot, now) === status);
}

/** [전체] 탭의 구역 하나: 상태 필터로 거른 그날 매물 수, 보여줄 앞쪽 매물, [더보기]로 넘길 남은 수 */
export type AllTabSection = {
  day: DashboardDay;
  total: number;
  shown: DashboardSlot[];
  more: number;
};

/**
 * [전체] 탭(#358): 오늘·예정 순서로 구역을 나누고, 구역마다 상태 필터로 거른 뒤 앞에서부터 limit개만 보여준다.
 * 비어 있는 구역도 돌려준다(화면이 "오늘 시작하는 매물이 없어요" 한 줄을 그린다)
 */
export function allTabSections(
  byDay: Record<DashboardDay, DashboardSlot[]>,
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
