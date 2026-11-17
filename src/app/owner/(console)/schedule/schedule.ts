// 원장님 예약 현황 캘린더 계산 (S-402, #23 11/15 정민석 계획). 화면과 서버가 같이 쓴다.
// - 주(일~토)·일 보기. 한국 날짜 'YYYY-MM-DD'로 다룬다(calendar-days.ts와 같은 방식)
// - 지난 날짜는 제한 없이 넘겨 본다(11/9 정민석: 대시보드에 [지난] 탭 대신 여기서 지난 예약을 다시 연다).
//   앞으로는 매물을 올릴 수 있는 날(오늘부터 ADVANCE_LISTING_DAYS일 뒤)이 들어가는 주·날까지
// - 칸의 세로 자리는 그 날 자정부터 지난 분이다. 자정을 넘는 매물은 시작한 날 열에 1440분 뒤까지 이어서 그린다
// - 시간이 겹치는 칸(취소 매물과 그 시간에 다시 올린 매물)은 나란히 놓는다(assignLanes)

import type { BusinessHours } from '@/db/schema/shops';
import type { SlotStatus } from '@/features/slot-status/slot-status';
import { kstDateKey } from '@/lib/time';
import { ADVANCE_LISTING_DAYS } from '@/server/policy';

import type { ReservationView } from '../reservations/reservation-detail';
import { addDaysToKey, partsOfKey, weekdayOfKey } from '../slots/calendar-days';
import { ownOpenSpan } from '../slots/slot-time';

export const SCHEDULE_PATH = '/owner/schedule';

export type ScheduleView = 'week' | 'day';

export const SCHEDULE_VIEW_LABELS: Record<ScheduleView, string> = { day: '일', week: '주' };

/** 지금 보는 보기와 날짜(주 보기면 그 날이 든 주) */
export type ScheduleQuery = { view: ScheduleView; dateKey: string };

/** 예약이 있는 칸의 예약. 샵에는 예약자 이름만 보여주고 연락처는 예약 상세에서 본다(#375) */
export type ScheduleReservation = {
  id: string;
  code: string;
  /** 예약자 이름(앞뒤 공백 뺀 값). 비어 있으면 null */
  customerName: string | null;
  view: ReservationView;
};

/** 캘린더 매물 칸 하나(화면으로 넘기는 값이라 시각은 ISO 문자열) */
export type ScheduleSlot = {
  kind: 'slot';
  id: string;
  startAt: string;
  endAt: string;
  /** 서버가 화면을 연 시각으로 계산한 상태(getSlotStatus) */
  status: SlotStatus;
  menuName: string;
  listPrice: number;
  salePrice: number;
  discountRate: number;
  /** 원장님이 올린 매물을 손님이 결제 중 */
  onHold: boolean;
  /** 지금 고칠 수 있는 매물(canEditSlot): 판매 전이고 결제 중이 아님 */
  editable: boolean;
  reservation: ScheduleReservation | null;
};

/** 캘린더 시간대 매물 하나(#308). 안에서 결제가 끝난 칸은 매물 칸(ScheduleSlot)으로 따로 온다 */
export type ScheduleWindow = {
  kind: 'window';
  id: string;
  startAt: string;
  endAt: string;
  /** 매물 상태 이름으로 바꾼 시간대 상태(WINDOW_VIEW_STATUS) */
  status: SlotStatus;
  menuCount: number;
};

/** 열 안에 놓은 칸. top·bottom은 그 날 자정부터 지난 분, lane은 겹칠 때 몇 번째 줄인지(0부터), lanes는 줄 수 */
export type Placed<T> = { item: T; top: number; bottom: number; lane: number; lanes: number };

/** 세로 범위(그 날 자정부터 지난 분, 1시간 단위) */
export type MinuteRange = { start: number; end: number };

/** 매물·영업시간이 하나도 없을 때 보여줄 세로 범위 */
export const DEFAULT_MINUTE_RANGE: MinuteRange = { start: 9 * 60, end: 21 * 60 };

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MINUTE_MS = 60_000;
const HOUR = 60;

/** 'YYYY-MM-DD' 모양이고 실제로 있는 날짜인지(2026-02-30은 아니다) */
export function isDateKey(value: string): boolean {
  return DATE_KEY.test(value) && addDaysToKey(value, 0) === value;
}

/** 앞으로 넘겨 볼 수 있는 마지막 날: 매물을 올릴 수 있는 마지막 날(S-205) */
export function lastScheduleKey(todayKey: string): string {
  return addDaysToKey(todayKey, ADVANCE_LISTING_DAYS);
}

/** 주소의 view·date를 보기와 날짜로. 모르는 값이면 주 보기·오늘, 마지막 날보다 뒤면 마지막 날 */
export function resolveScheduleQuery(
  raw: { view?: string; date?: string },
  todayKey: string,
): ScheduleQuery {
  const view: ScheduleView = raw.view === 'day' ? 'day' : 'week';
  const lastKey = lastScheduleKey(todayKey);
  const date = raw.date !== undefined && isDateKey(raw.date) ? raw.date : todayKey;
  return { view, dateKey: date > lastKey ? lastKey : date };
}

/** 보는 날들: 주 보기면 그 날이 든 주의 일요일부터 토요일까지, 일 보기면 그 날 하나 */
export function scheduleDays({ view, dateKey }: ScheduleQuery): string[] {
  if (view === 'day') return [dateKey];
  const sunday = addDaysToKey(dateKey, -weekdayOfKey(dateKey));
  return Array.from({ length: 7 }, (_, index) => addDaysToKey(sunday, index));
}

/**
 * [<]·[>]로 갈 곳. 주 보기는 7일, 일 보기는 하루씩. 앞으로 갈 곳이 마지막 날보다 뒤에서 시작하면 null(버튼을 잠근다).
 * 날짜는 마지막 날을 넘지 않게 맞춘다(주 보기에서 그 주 안의 마지막 날)
 */
export function shiftSchedule(
  query: ScheduleQuery,
  direction: -1 | 1,
  todayKey: string,
): ScheduleQuery | null {
  const lastKey = lastScheduleKey(todayKey);
  const moved = addDaysToKey(query.dateKey, direction * (query.view === 'week' ? 7 : 1));
  const next = { view: query.view, dateKey: moved > lastKey ? lastKey : moved };
  const nextFirst = scheduleDays(next)[0];
  // 마지막 날에 맞추고 나니 지금 보는 주·날 그대로면 더 갈 곳이 없다
  return nextFirst > lastKey || nextFirst === scheduleDays(query)[0] ? null : next;
}

/** 캘린더 주소. 예: /owner/schedule?view=week&date=2026-11-15 */
export function scheduleHref({ view, dateKey }: ScheduleQuery): string {
  return `${SCHEDULE_PATH}?view=${view}&date=${dateKey}`;
}

/** 날짜 이름. 예: "11/15(일)" */
export function dayLabel(key: string): string {
  const { month, day } = partsOfKey(key);
  return `${month}/${day}(${WEEKDAYS[weekdayOfKey(key)]})`;
}

/** 보는 기간 이름. 예: "11/15(일) ~ 11/21(토)", 일 보기는 "11/15(일)". 해가 다르면 앞에 연도 */
export function periodLabel(days: readonly string[]): string {
  const first = days[0];
  const last = days[days.length - 1];
  const withYear = (key: string) => `${partsOfKey(key).year}/${dayLabel(key)}`;
  if (first === last) return dayLabel(first);
  return partsOfKey(first).year === partsOfKey(last).year
    ? `${dayLabel(first)} ~ ${dayLabel(last)}`
    : `${withYear(first)} ~ ${withYear(last)}`;
}

/** 그 날(한국) 자정부터 지난 분. 다음 날이면 1440보다 크다 */
export function minutesFromDayStart(dayKey: string, iso: string): number {
  return (Date.parse(iso) - Date.parse(`${dayKey}T00:00:00+09:00`)) / MINUTE_MS;
}

/**
 * 칸을 시작한 날(한국) 열에 놓는다. 보는 날에 시작하지 않은 칸은 뺀다. 열마다 겹치는 칸은 나란히(assignLanes)
 */
export function placeByDay<T extends { startAt: string; endAt: string }>(
  items: readonly T[],
  days: readonly string[],
): Map<string, Placed<T>[]> {
  const byDay = new Map<string, Placed<T>[]>(days.map((day) => [day, []]));
  for (const item of items) {
    const day = kstDateKey(new Date(item.startAt));
    byDay.get(day)?.push({
      item,
      top: minutesFromDayStart(day, item.startAt),
      bottom: minutesFromDayStart(day, item.endAt),
      lane: 0,
      lanes: 1,
    });
  }
  for (const [day, placed] of byDay) byDay.set(day, assignLanes(placed));
  return byDay;
}

/**
 * 겹치는 칸을 나란히 놓는다. 서로 이어서 겹치는 칸 묶음마다, 칸을 시작 순서로 놓으면서 비어 있는 가장 왼쪽 줄에 넣고,
 * 묶음 안의 칸은 모두 그 묶음의 줄 수만큼 폭을 나눈다. 끝 시각에 바로 이어지는 칸은 겹치지 않는다
 */
export function assignLanes<T>(placed: readonly Placed<T>[]): Placed<T>[] {
  const sorted = [...placed].sort((a, b) => a.top - b.top || a.bottom - b.bottom);
  const result: Placed<T>[] = [];
  let group: Placed<T>[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;
  const closeGroup = () => {
    for (const item of group) result.push({ ...item, lanes: laneEnds.length });
    group = [];
    laneEnds = [];
  };
  for (const item of sorted) {
    if (item.top >= groupEnd) closeGroup();
    const free = laneEnds.findIndex((end) => end <= item.top);
    const lane = free === -1 ? laneEnds.length : free;
    laneEnds[lane] = item.bottom;
    group.push({ ...item, lane });
    groupEnd = group.length === 1 ? item.bottom : Math.max(groupEnd, item.bottom);
  }
  closeGroup();
  return result;
}

/**
 * 세로 범위: 보는 날들의 영업시간(그 요일에 입력한 구간)과 칸을 모두 덮도록 1시간 단위로 넓힌다.
 * 둘 다 없으면 09:00~21:00
 */
export function verticalRange(
  days: readonly string[],
  hours: BusinessHours,
  blocks: readonly { top: number; bottom: number }[],
): MinuteRange {
  const ranges = [
    ...days.flatMap((day) => {
      const span = ownOpenSpan(day, hours);
      return span ? [span] : [];
    }),
    ...blocks.map((block) => ({ start: block.top, end: block.bottom })),
  ];
  if (ranges.length === 0) return DEFAULT_MINUTE_RANGE;
  const start = Math.min(...ranges.map((range) => range.start));
  const end = Math.max(...ranges.map((range) => range.end));
  return {
    start: Math.max(0, Math.floor(start / HOUR) * HOUR),
    end: Math.max(Math.ceil(end / HOUR) * HOUR, Math.floor(start / HOUR) * HOUR + HOUR),
  };
}

/** 칸을 누르면 갈 곳: 예약이 있으면 예약 상세, 지금 고칠 수 있는 매물이면 매물 수정, 그 밖에는 null(누를 수 없다) */
export function slotHref(
  slot: Pick<ScheduleSlot, 'id' | 'editable' | 'reservation'>,
): string | null {
  if (slot.reservation) return `/owner/reservations/${slot.reservation.id}`;
  return slot.editable ? `/owner/slots/${slot.id}/edit` : null;
}
