// 시간대 매물 고객 화면 값 만들기 (C-201·C-301 시간대, #308 ②). 계산만 한다(DB 없이 테스트한다).
// 읽기는 store.ts, 읽은 값을 이 계산에 넘겨 결과를 만드는 것은 queries.ts가 한다.

import type { HomeFilters } from '@/features/map/filters';

import { menusMatchingFilters, type Range, windowStarts } from './starts';
import type { SlotWindowMenu } from './types';

/** 시간대에 올린 서비스 한 줄(올릴 때 값, slot_window_menus). 메뉴를 나중에 고치거나 숨겨도 그대로다 */
export type WindowMenuRow = Omit<SlotWindowMenu, 'starts'>;

/** 서비스 하나: 화면에 줄 값과 계산용 시작 시각 */
export type WindowMenuView = { menu: SlotWindowMenu; startRanges: Range[] };

/** 서비스마다 지금 시작할 수 있는 시각을 붙인다(받은 순서 그대로) */
export function windowMenuViews(input: {
  window: Range;
  menus: readonly WindowMenuRow[];
  /** 그 샵의 이미 차 있는 시간(예약됨·결제 중인 매물) */
  occupied: readonly Range[];
  now: Date;
}): WindowMenuView[] {
  return input.menus.map((menu) => {
    const startRanges = windowStarts({
      window: input.window,
      durationMinutes: menu.durationMinutes,
      occupied: input.occupied,
      now: input.now,
    });
    return {
      menu: {
        ...menu,
        starts: startRanges.map((start) => ({
          startAt: start.start.toISOString(),
          endAt: start.end.toISOString(),
        })),
      },
      startRanges,
    };
  });
}

/** 목록 카드의 서비스 요약 */
export type WindowCardSummary = {
  menuCount: number;
  firstMenuName: string;
  maxDiscountRate: number;
  minSalePrice: number;
  earliestStart: Date;
};

/**
 * 목록 카드의 서비스 요약. 남은 시간에 들어가는 서비스만 센다.
 * 남은 시간에 들어가는 서비스가 없거나(꽉 참), 그중 필터에 맞는 서비스가 하나도 없으면 null(목록에서 뺀다)
 */
export function windowCardSummary(
  views: readonly WindowMenuView[],
  filters: Omit<HomeFilters, 'category'>,
): WindowCardSummary | null {
  const open = views.filter((view) => view.startRanges.length > 0);
  if (open.length === 0) return null;
  const matched = menusMatchingFilters(
    open.map((view) => ({ ...view.menu, starts: view.startRanges })),
    filters,
  );
  if (matched.length === 0) return null;
  return {
    menuCount: open.length,
    firstMenuName: open[0].menu.name,
    maxDiscountRate: Math.max(...open.map((view) => view.menu.discountRate)),
    minSalePrice: Math.min(...open.map((view) => view.menu.salePrice)),
    earliestStart: new Date(Math.min(...open.map((view) => view.startRanges[0].start.getTime()))),
  };
}
