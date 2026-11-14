// 시간대 매물 등록 입력 확인 (S-201 두 번째 방식, #308). 계산만 한다. 원장님 createSlotWindows가 저장 전에 부르고,
// 진짜 버전도 같은 확인을 쓴다. 시작 시각·영업시간·게시 시각은 매물 등록과 같은 계산이다(정민석 slot-time.ts).
//
// - 켜진 칸의 이어진 묶음(ranges)마다 시간대 하나. 끝과 시작이 맞닿은 묶음은 하나로 합친다. 묶음끼리 겹치면 입력 오류
// - 묶음의 시작·끝은 30분 단위, 시작은 지금 뒤·14일 안, 영업시간 안(입력하지 않은 요일은 막지 않는다)
// - 같은 샵에서 이미 올린 매물·시간대와 겹치면 WINDOW_OVERLAP(마지막에는 DB 제약·트리거가 막는다, #319)
// - 서비스는 내 샵의 숨기지 않은 메뉴, 같은 메뉴는 한 번, 할인율은 선택지 중 하나, 소요 시간이 가장 긴 묶음보다 길면 MENU_TOO_LONG

import {
  checkBusinessHours,
  checkStart,
  isOnStep,
  publishPlan,
} from '@/app/owner/(console)/slots/slot-time';
import type { BusinessHours } from '@/db/schema/shops';
import { calcSalePrice, DISCOUNT_RATE_OPTIONS, type ServiceType } from '@/server/policy';

import type { SlotWindowErrorCode } from './errors';
import type { Range } from './starts';
import type { WindowMenuInput } from './types';

/** 그 샵의 메뉴(등록 화면이 고를 수 있는 것과 같은 값) */
export type ShopMenu = {
  id: string;
  serviceType: ServiceType;
  name: string;
  description: string | null;
  listPrice: number;
  durationMinutes: number;
  hidden: boolean;
};

/** 저장할 시간대 하나 */
export type WindowDraft = Range & { publishAt: Date; status: 'scheduled' | 'published' };

/** 저장할 서비스 하나(올릴 때 값) */
export type WindowMenuDraft = {
  menuId: string;
  serviceType: ServiceType;
  menuName: string;
  menuDescription: string | null;
  listPrice: number;
  durationMinutes: number;
  discountRate: number;
  salePrice: number;
};

export type WindowDraftCheck =
  | { ok: true; windows: WindowDraft[]; menus: WindowMenuDraft[] }
  | { ok: false; code: SlotWindowErrorCode };

/** 맞닿은 묶음은 합치고 시작 순으로. 겹치는 묶음이 있으면 null */
export function mergeRanges(ranges: readonly Range[]): Range[] | null {
  const sorted = [...ranges].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: Range[] = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last && range.start.getTime() < last.end.getTime()) return null;
    if (last && range.start.getTime() === last.end.getTime()) last.end = range.end;
    else merged.push({ start: range.start, end: range.end });
  }
  return merged;
}

const overlaps = (a: Range, b: Range) =>
  a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();

export function checkWindowDraft(input: {
  ranges: readonly Range[];
  menus: readonly WindowMenuInput[];
  shopMenus: readonly ShopMenu[];
  businessHours: BusinessHours;
  /** 그 샵에 이미 올린 게시예정·게시중·예약됨 매물과 게시예정·게시중 시간대 */
  busy: readonly Range[];
  now: Date;
}): WindowDraftCheck {
  const { menus, shopMenus, businessHours, busy, now } = input;
  if (input.ranges.length === 0 || menus.length === 0) return { ok: false, code: 'INVALID_INPUT' };
  if (input.ranges.some((range) => range.end.getTime() <= range.start.getTime())) {
    return { ok: false, code: 'INVALID_INPUT' };
  }
  if (input.ranges.some((range) => !isOnStep(range.start) || !isOnStep(range.end))) {
    return { ok: false, code: 'NOT_ON_STEP' };
  }
  const ranges = mergeRanges(input.ranges);
  if (!ranges) return { ok: false, code: 'INVALID_INPUT' };

  for (const range of ranges) {
    const startProblem = checkStart(range.start, now);
    if (startProblem) return { ok: false, code: startProblem };
    const hoursProblem = checkBusinessHours(range, businessHours);
    if (hoursProblem) return { ok: false, code: hoursProblem };
    if (busy.some((taken) => overlaps(range, taken))) return { ok: false, code: 'WINDOW_OVERLAP' };
  }

  const menuIds = new Set(menus.map((menu) => menu.menuId));
  if (menuIds.size !== menus.length) return { ok: false, code: 'INVALID_INPUT' };
  if (
    menus.some((menu) => !(DISCOUNT_RATE_OPTIONS as readonly number[]).includes(menu.discountRate))
  ) {
    return { ok: false, code: 'INVALID_INPUT' };
  }
  const longest = Math.max(...ranges.map((range) => range.end.getTime() - range.start.getTime()));
  const menuDrafts: WindowMenuDraft[] = [];
  for (const choice of menus) {
    const menu = shopMenus.find((item) => item.id === choice.menuId && !item.hidden);
    if (!menu) return { ok: false, code: 'MENU_NOT_FOUND' };
    if (menu.durationMinutes * 60 * 1000 > longest) return { ok: false, code: 'MENU_TOO_LONG' };
    menuDrafts.push({
      menuId: menu.id,
      serviceType: menu.serviceType,
      menuName: menu.name,
      menuDescription: menu.description,
      listPrice: menu.listPrice,
      durationMinutes: menu.durationMinutes,
      discountRate: choice.discountRate,
      salePrice: calcSalePrice(menu.listPrice, choice.discountRate),
    });
  }

  return {
    ok: true,
    windows: ranges.map((range) => ({ ...range, ...publishPlan(range.start, now) })),
    menus: menuDrafts,
  };
}
