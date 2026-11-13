// 시간대 매물의 시작 가능 시각·상태·필터 계산 (#308). 계산만 한다(화면과 서버 어디서나 가져올 수 있다).
// 고객 목록·상세(view.ts)가 쓰고, 화면에서도 가져다 쓸 수 있다.
//
// - 시작 시각은 시간대 시작부터 30분 단위(SLOT_START_STEP_MINUTES), 끝(시작 + 소요 시간)이 시간대 끝을 넘으면 안 된다.
//   예: 펌 2시간, 시간대 13:00~18:00이면 시작은 16:00까지
// - 지금보다 뒤인 시각만(지금과 같은 시각은 지난 것으로 본다, 매물 등록 checkStart와 같다)
// - 이미 차 있는 시간(그 샵의 예약대기·게시중·예약됨 매물, 결제 중 홀딩 포함)과 겹치면 안 된다
// - 한 고객이 예약해도 남은 시간은 계속 판다. 남은 시간에 들어가는 서비스가 하나도 없으면 꽉 참(full)

import { PRICE_FILTER_RANGES, SLOT_START_STEP_MINUTES, TIME_FILTER_RANGES } from '@/server/policy';
import type { HomeFilters } from '@/features/map/filters';
import { utcToKst } from '@/lib/time';

import type { WindowState } from './types';

const MINUTE_MS = 60 * 1000;

/** 시간 구간 [start, end). 끝과 다음 시작이 같으면 겹치지 않는다 */
export type Range = { start: Date; end: Date };

const overlaps = (a: Range, b: Range) =>
  a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();

/** 한 서비스(소요 시간)의 지금 시작할 수 있는 시각들 */
export function windowStarts(input: {
  window: Range;
  durationMinutes: number;
  /** 이미 차 있는 시간 */
  occupied: readonly Range[];
  now: Date;
}): Range[] {
  const { window, durationMinutes, occupied, now } = input;
  const duration = durationMinutes * MINUTE_MS;
  const step = SLOT_START_STEP_MINUTES * MINUTE_MS;
  if (duration <= 0) return [];
  const result: Range[] = [];
  for (
    let start = window.start.getTime();
    start + duration <= window.end.getTime();
    start += step
  ) {
    if (start <= now.getTime()) continue;
    const range = { start: new Date(start), end: new Date(start + duration) };
    if (occupied.some((busy) => overlaps(range, busy))) continue;
    result.push(range);
  }
  return result;
}

/**
 * 시간대 상태. 저장 상태(예약대기·게시중·마감)와 게시 시각·끝·남은 시간으로 계산한다(매물 상태처럼 시간이 지나서 바뀌는 것은 저장하지 않는다)
 * menus에는 그 시간대에 올린 서비스의 소요 시간을 넘긴다
 */
export function windowStatus(input: {
  status: 'scheduled' | 'published' | 'closed';
  publishAt: Date;
  window: Range;
  menuDurations: readonly number[];
  occupied: readonly Range[];
  now: Date;
}): WindowState {
  const { status, publishAt, window, menuDurations, occupied, now } = input;
  if (status === 'closed' || window.end.getTime() <= now.getTime()) return 'closed';
  if (publishAt.getTime() > now.getTime()) return 'scheduled';
  const anyStart = menuDurations.some(
    (durationMinutes) => windowStarts({ window, durationMinutes, occupied, now }).length > 0,
  );
  return anyStart ? 'published' : 'full';
}

/** 시간대 서비스가 목록 필터에 맞는지 볼 때 필요한 값 */
export type FilterableMenu = {
  serviceType: string;
  salePrice: number;
  discountRate: number;
  starts: readonly Range[];
};

type FilterRangeLike = { key: string; min: number | null; max: number | null };

const inRange = (value: number, range: FilterRangeLike) =>
  (range.min === null || value >= range.min) && (range.max === null || value < range.max);

const anyRange = (value: number, all: readonly FilterRangeLike[], picked: readonly string[]) =>
  picked.length === 0 || all.some((range) => picked.includes(range.key) && inRange(value, range));

/**
 * 목록 필터(J5)에 맞는 서비스만 남긴다. 시간대는 서비스 중 하나라도 맞으면 보인다(#308).
 * 업종은 샵 기준이라 부른 쪽이 따로 본다. 시작 시각 필터는 그 서비스의 시작 가능 시각 중 하나라도 구간에 들면 맞다
 */
export function menusMatchingFilters<T extends FilterableMenu>(
  menus: readonly T[],
  filters: Omit<HomeFilters, 'category'>,
): T[] {
  return menus.filter(
    (menu) =>
      (filters.services.length === 0 ||
        (filters.services as readonly string[]).includes(menu.serviceType)) &&
      anyRange(menu.salePrice, PRICE_FILTER_RANGES, filters.prices) &&
      (filters.times.length === 0 ||
        menu.starts.some((start) =>
          anyRange(utcToKst(start.start).hour, TIME_FILTER_RANGES, filters.times),
        )) &&
      (filters.minDiscount === null || menu.discountRate >= filters.minDiscount),
  );
}
