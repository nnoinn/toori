// 원장님 대시보드 매물 나누기 (O9, S-401). 화면('use client')과 서버가 같이 쓴다.
// 상태는 O1의 getSlotStatus로 계산한다(시간이 지나서 바뀌는 상태). "지금"은 서버 시각을 받는다.

import { kstToUtc, utcToKst } from '@/lib/time';
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
  /** 예약된 매물이면 예약번호 */
  reservationCode: string | null;
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

export type DashboardTab = 'today' | 'upcoming';

/** 한국 날짜로 오늘 0시(UTC Date). 이보다 먼저 시작한 매물은 대시보드 탭에 나오지 않는다 */
export function startOfKstDay(now: Date): Date {
  const { year, month, day } = utcToKst(now);
  return kstToUtc({ year, month, day, hour: 0, minute: 0 });
}

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
): Record<DashboardTab, DashboardSlot[]> {
  const today = startOfKstDay(now).getTime();
  const tomorrow = startOfKstTomorrow(now).getTime();
  const result: Record<DashboardTab, DashboardSlot[]> = { today: [], upcoming: [] };
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
