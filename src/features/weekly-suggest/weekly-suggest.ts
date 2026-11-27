// 주간 매물 등록 권유(S-411, 3단계 3-A, 연결 25 #626). 권유 계산(정민석)과 월요일 오전 10시 알림 작업(강규민)이 같이 쓴다.
// 이 파일은 DB 없이 계산만 한다(화면에서도 쓸 수 있다). 조회는 weekly-suggest-store.ts의 suggestWeeklySlots.
//
// 권유 규칙(명세 🟡 기본값, #626에서 맞춘 세부):
// 1. 지난 4주(이번 주 월요일 0시 전 28일)에 팔린 매물을 요일·시작 시각·메뉴·할인율·신규 고객 전용으로 묶는다.
//    팔린 매물은 취소·무효가 아닌 예약이 있는 매물이다(노쇼 포함, 시간대 매물로 팔린 것 포함). 조회 쪽에서 거른다.
//    많이 팔린 묶음부터, 같으면 최근에 팔린 묶음부터 본다.
// 2. 묶음마다 이번 주 같은 요일 날짜에 놓아 보고 빼는 것: 지난 날짜·시각, 쉬는 날·영업시간 밖(지금 메뉴 소요 시간으로),
//    그날 게시예정·게시중·예약됨 매물이나 시간대 매물이 있는 날, 다른 매물이나 앞에서 고른 권유와 겹치는 시간,
//    지금 고를 수 없는 메뉴(숨김·업종 변경)·할인율.
// 3. 최대 3개. 같은 날에 여러 개도 권한다. 권한 매물도 게시 48시간 규칙을 그대로 따른다(올릴 때 게시예정이 될 수 있다).
// 4. 지금 올릴 수 있는 메뉴의 판매가 없으면 no_history('지난 매물로 빠르게 올리기'를 연다),
//    판매는 있는데 모두 빠지면 nothing_to_suggest(알림을 보내지 않는다).

import type { BusinessHours } from '@/db/schema/shops';
import { kstDateKey, kstToUtc, utcToKst } from '@/lib/time';
import {
  DISCOUNT_RATE_OPTIONS,
  type DiscountRate,
  WEEKLY_SUGGEST_LOOKBACK_WEEKS,
  WEEKLY_SUGGEST_MAX_ITEMS,
} from '@/server/policy';

import { addDaysToKey, partsOfKey, weekdayOfKey } from '@/app/owner/(console)/slots/calendar-days';
import {
  checkBusinessHours,
  checkStart,
  rangesOverlap,
  slotEnd,
  type TimeRange,
} from '@/app/owner/(console)/slots/slot-time';

/** 권하는 매물 하나. 가격은 등록할 때 지금 메뉴 값으로 계산한다 */
export type SuggestedSlot = {
  /** 한국 날짜 'YYYY-MM-DD' */
  date: string;
  /** 한국 시각 'HH:MM' */
  startTime: string;
  menuId: string;
  discountRate: DiscountRate;
  newCustomerOnly: boolean;
};

export type WeeklySuggestion =
  /** 권할 매물이 1~3개(날짜·시각 순서). weekStart는 이번 주 월요일(한국 날짜) */
  | { status: 'suggested'; weekStart: string; items: SuggestedSlot[] }
  /** 지난 4주에 지금 올릴 수 있는 메뉴의 판매가 없음 → '지난 매물로 빠르게 올리기'(#521) */
  | { status: 'no_history' }
  /** 판매는 있지만 이번 주에 권할 빈 날짜·시각이 없음(이미 올렸거나 쉬는 날·영업시간 밖) → 알림을 보내지 않는다 */
  | { status: 'nothing_to_suggest' };

/** 지난 판매 한 건(조회 결과) */
export type SoldSlot = {
  startAt: Date;
  menuId: string;
  discountRate: number;
  newCustomerOnly: boolean;
};

/** 지금 매물로 고를 수 있는 메뉴(숨기지 않았고 지금 업종의 서비스 종류) */
export type SuggestMenu = { id: string; durationMinutes: number };

/** 계산에 넘기는 값 */
export type WeeklySuggestInput = {
  now: Date;
  sold: readonly SoldSlot[];
  menus: readonly SuggestMenu[];
  businessHours: BusinessHours;
  /** 같은 샵의 게시예정·게시중·예약됨 매물과 게시예정·게시중 시간대 매물 시간(오늘 0시부터 이번 주 끝까지) */
  busy: readonly TimeRange[];
};

/** 이번 주 월요일(한국 날짜). 일요일은 그 주의 마지막 날이다 */
export function weekStartOf(now: Date): string {
  const today = kstDateKey(now);
  return addDaysToKey(today, -((weekdayOfKey(today) + 6) % 7));
}

/** 한국 날짜의 0시 */
function midnightOf(dateKey: string): Date {
  return kstToUtc({ ...partsOfKey(dateKey), hour: 0, minute: 0 });
}

/** 판매를 보는 구간 [from, to): 이번 주 월요일 0시 전 4주 */
export function lookbackRange(now: Date): TimeRange {
  const weekStart = weekStartOf(now);
  return {
    start: midnightOf(addDaysToKey(weekStart, -7 * WEEKLY_SUGGEST_LOOKBACK_WEEKS)),
    end: midnightOf(weekStart),
  };
}

/**
 * 이미 올린 매물을 읽을 구간 [from, to): 오늘 0시부터 다음 주 월요일 하루 끝까지.
 * 오늘 이미 끝난 매물도 '그날 매물이 있는 날'로 보고, 일요일 밤에 권한 매물이 다음 날 새벽 매물과 겹치는지도 본다
 */
export function busyRange(now: Date): TimeRange {
  return {
    start: midnightOf(kstDateKey(now)),
    end: midnightOf(addDaysToKey(weekStartOf(now), 8)),
  };
}

const isDiscountRate = (rate: number): rate is DiscountRate =>
  (DISCOUNT_RATE_OPTIONS as readonly number[]).includes(rate);

const pad2 = (value: number) => String(value).padStart(2, '0');

type SoldGroup = {
  weekday: number;
  hour: number;
  minute: number;
  menuId: string;
  discountRate: DiscountRate;
  newCustomerOnly: boolean;
  count: number;
  lastSoldAt: number;
};

/** 요일·시작 시각·메뉴·할인율·신규 고객 전용이 같은 판매끼리 묶고, 많이 팔린 묶음부터(같으면 최근에 팔린 묶음부터) */
export function groupSold(sold: readonly SoldSlot[], menuIds: ReadonlySet<string>): SoldGroup[] {
  const groups = new Map<string, SoldGroup>();
  for (const row of sold) {
    const { discountRate } = row;
    if (!menuIds.has(row.menuId) || !isDiscountRate(discountRate)) continue;
    const { weekday, hour, minute } = utcToKst(row.startAt);
    const key = [weekday, hour, minute, row.menuId, discountRate, row.newCustomerOnly].join('|');
    const at = row.startAt.getTime();
    const group = groups.get(key);
    if (group) {
      group.count += 1;
      group.lastSoldAt = Math.max(group.lastSoldAt, at);
    } else {
      groups.set(key, {
        weekday,
        hour,
        minute,
        menuId: row.menuId,
        discountRate,
        newCustomerOnly: row.newCustomerOnly,
        count: 1,
        lastSoldAt: at,
      });
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || b.lastSoldAt - a.lastSoldAt);
}

/** 이번 주 권유를 고른다 */
export function pickWeeklySuggestion({
  now,
  sold,
  menus,
  businessHours,
  busy,
}: WeeklySuggestInput): WeeklySuggestion {
  const duration = new Map(menus.map((menu) => [menu.id, menu.durationMinutes]));
  const groups = groupSold(sold, new Set(duration.keys()));
  if (groups.length === 0) return { status: 'no_history' };

  const weekStart = weekStartOf(now);
  // 매물의 날짜는 시작 시각의 날짜다(수요일 01:00 = 수요일 매물)
  const listedDates = new Set(busy.map((range) => kstDateKey(range.start)));
  const picked: (SuggestedSlot & TimeRange)[] = [];

  for (const group of groups) {
    if (picked.length >= WEEKLY_SUGGEST_MAX_ITEMS) break;
    const date = addDaysToKey(weekStart, (group.weekday + 6) % 7);
    if (listedDates.has(date)) continue;
    const start = kstToUtc({ ...partsOfKey(date), hour: group.hour, minute: group.minute });
    if (checkStart(start, now) !== null) continue;
    const range = { start, end: slotEnd(start, duration.get(group.menuId)!) };
    if (checkBusinessHours(range, businessHours) !== null) continue;
    if ([...busy, ...picked].some((other) => rangesOverlap(range, other))) continue;
    picked.push({
      ...range,
      date,
      startTime: `${pad2(group.hour)}:${pad2(group.minute)}`,
      menuId: group.menuId,
      discountRate: group.discountRate,
      newCustomerOnly: group.newCustomerOnly,
    });
  }

  if (picked.length === 0) return { status: 'nothing_to_suggest' };
  return {
    status: 'suggested',
    weekStart,
    items: picked
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .map(({ date, startTime, menuId, discountRate, newCustomerOnly }) => ({
        date,
        startTime,
        menuId,
        discountRate,
        newCustomerOnly,
      })),
  };
}

/** 등록 화면이 권유를 채워 여는 표시(?from=weekly-suggest) */
export const WEEKLY_SUGGEST_FROM = 'weekly-suggest';

/**
 * 알림을 누르면 열 주소(#626). 권유가 있으면 권유를 채워 여는 등록 화면(열 때 그때 기준으로 다시 계산한다),
 * 판매 기록이 없으면 '지난 매물로 빠르게 올리기'가 맨 위에 있는 등록 화면. nothing_to_suggest는 알림을 보내지 않는다
 */
export function weeklySuggestHref(
  status: Exclude<WeeklySuggestion['status'], 'nothing_to_suggest'>,
): string {
  return status === 'suggested'
    ? `/owner/slots/new?from=${WEEKLY_SUGGEST_FROM}`
    : '/owner/slots/new';
}
