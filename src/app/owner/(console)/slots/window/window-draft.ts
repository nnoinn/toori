// 시간대 매물 ② 서비스 ③ 할인율 ④ 확인의 계산 (#308, S-201 두 번째 방식). 화면('use client')과 테스트가 같이 쓴다.
// - ② 소요 시간이 켜진 가장 긴 묶음보다 긴 서비스는 고를 수 없다(딱 같으면 고를 수 있다). 서버 createSlotWindows의
//   MENU_TOO_LONG과 같은 기준이다. 짧은 묶음에만 안 들어가는 서비스는 고를 수 있고, 그 묶음에서는 고객에게 보이지 않는다
// - ③ 할인율은 전체에 한 번에 고르고, 서비스마다 바꿀 수 있다
// - 처음 열 때 그 샵이 마지막으로 올린 시간대의 서비스·할인율·신규 고객 전용을 채운다(getLastWindowSettings)
// 저장할 때는 서버가 시각·영업시간·겹침·메뉴·할인율을 다시 확인하고 할인가를 계산한다.

import type { DiscountRate } from '@/server/policy';
import type { CreateSlotWindowsInput, LastWindowSettings } from '@/server/slot-windows/types';

import type { SlotMenuOption } from '../slot-form';
import { isDiscountRate } from '../slot-pricing';
import type { TimeRange } from '../slot-time';

const MINUTE_MS = 60 * 1000;

/** 서비스마다 고른 할인율(메뉴 id → 할인율). 고르지 않은 서비스는 없다 */
export type MenuRates = Readonly<Record<string, DiscountRate>>;

/** 묶음 길이(분) */
export function rangeMinutes(range: TimeRange): number {
  return (range.end.getTime() - range.start.getTime()) / MINUTE_MS;
}

/** 서비스가 고른 시간에 들어가는지 */
export type MenuFit = {
  /** 가장 긴 묶음에 들어가면(소요 시간 ≤ 가장 긴 묶음) 고를 수 있다 */
  fits: boolean;
  /** 가장 긴 묶음 길이(분). 고른 시간이 없으면 0 */
  longestMinutes: number;
  /** 이 서비스가 들어가지 않는 짧은 묶음(고를 수 있어도 그 묶음에서는 고객에게 보이지 않는다) */
  shortRanges: TimeRange[];
};

export function menuFit(durationMinutes: number, ranges: readonly TimeRange[]): MenuFit {
  const longestMinutes = Math.max(0, ...ranges.map(rangeMinutes));
  return {
    fits: ranges.length > 0 && durationMinutes <= longestMinutes,
    longestMinutes,
    shortRanges: ranges.filter((range) => rangeMinutes(range) < durationMinutes),
  };
}

/**
 * 고른 서비스 중 지금 고른 시간에 들어가는 것만, 메뉴 목록 순서로. ①로 돌아가 시간을 줄여서 안 들어가게 된 서비스는 빠진다
 * (② 화면에서 그 서비스는 잠기고 이유가 보인다)
 */
export function fittingMenuIds(
  menus: readonly SlotMenuOption[],
  chosen: ReadonlySet<string>,
  ranges: readonly TimeRange[],
): string[] {
  return menus
    .filter((menu) => chosen.has(menu.id) && menuFit(menu.durationMinutes, ranges).fits)
    .map((menu) => menu.id);
}

/** ③ "전체에 한 번에": 고른 서비스 모두 그 할인율로 */
export function applyRateToAll(
  rates: MenuRates,
  menuIds: readonly string[],
  rate: DiscountRate,
): Record<string, DiscountRate> {
  return { ...rates, ...Object.fromEntries(menuIds.map((id) => [id, rate])) };
}

/** 고른 서비스가 모두 같은 할인율이면 그 값(전체 칩을 골라진 모양으로). 하나라도 다르거나 고르지 않았으면 null */
export function commonRate(rates: MenuRates, menuIds: readonly string[]): DiscountRate | null {
  const first = menuIds.length > 0 ? rates[menuIds[0]] : undefined;
  if (first === undefined) return null;
  return menuIds.every((id) => rates[id] === first) ? first : null;
}

/** 처음 열 때 채울 값 */
export type WindowPrefill = {
  chosen: Set<string>;
  rates: Record<string, DiscountRate>;
  newCustomerOnly: boolean;
};

/**
 * 지난 설정(getLastWindowSettings)을 지금 고를 수 있는 메뉴(숨기지 않았고 지금 업종)로 걸러 채운다.
 * 할인율이 선택지 밖이면 그 서비스만 고르고 할인율은 비워 둔다. 올린 적 없으면 빈 값
 */
export function prefillFromLast(
  last: LastWindowSettings | null,
  menus: readonly SlotMenuOption[],
): WindowPrefill {
  const available = new Set(menus.map((menu) => menu.id));
  const chosen = new Set<string>();
  const rates: Record<string, DiscountRate> = {};
  for (const item of last?.menus ?? []) {
    if (!available.has(item.menuId)) continue;
    chosen.add(item.menuId);
    if (isDiscountRate(item.discountRate)) rates[item.menuId] = item.discountRate;
  }
  return { chosen, rates, newCustomerOnly: chosen.size > 0 && (last?.newCustomerOnly ?? false) };
}

/** createSlotWindows 입력. 고른 시간·서비스가 없거나 할인율을 고르지 않은 서비스가 있으면 null */
export function windowDraftInput(
  ranges: readonly TimeRange[],
  menuIds: readonly string[],
  rates: MenuRates,
  newCustomerOnly: boolean,
): CreateSlotWindowsInput | null {
  if (ranges.length === 0 || menuIds.length === 0) return null;
  const menus: CreateSlotWindowsInput['menus'] = [];
  for (const menuId of menuIds) {
    const discountRate = rates[menuId];
    if (discountRate === undefined) return null;
    menus.push({ menuId, discountRate });
  }
  return {
    ranges: ranges.map((range) => ({
      startAt: range.start.toISOString(),
      endAt: range.end.toISOString(),
    })),
    menus,
    newCustomerOnly,
  };
}
