// 거리순 목록을 샵별로 묶어 보여주기(11/18 정찬형). 거리순은 같은 샵 줄이 붙어 오므로(merge.ts·queries.ts),
// 붙어 있는 같은 샵 줄을 한 묶음으로 만든다. 화면 없이 테스트한다.

import type { ListItem } from './types';

/** 접힌 묶음에서 먼저 보여주는 매물 수. 더 있으면 [매물 N개 더 보기] */
export const GROUP_PREVIEW_COUNT = 3;

export type ShopGroup = {
  shopId: string;
  /** 이 샵의 매물·시간대(받은 순서 그대로) */
  items: ListItem[];
};

/**
 * 붙어 있는 같은 샵 줄을 하나로 묶는다. 순서는 그대로다.
 * 같은 샵이 떨어져서 다시 나오면(거리순이 아니면 생길 수 있다) 따로 묶는다
 */
export function groupByShop(items: readonly ListItem[]): ShopGroup[] {
  const groups: ShopGroup[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && last.shopId === item.shopId) last.items.push(item);
    else groups.push({ shopId: item.shopId, items: [item] });
  }
  return groups;
}

/** 묶음에서 가장 큰 할인율(시간대는 서비스 중 가장 큰 할인율) */
export function groupMaxDiscount(group: ShopGroup): number {
  return Math.max(
    ...group.items.map((item) => (item.kind === 'slot' ? item.discountRate : item.maxDiscountRate)),
  );
}

/** 묶음 머리 줄의 요약. 예: "매물 4개 · 최대 40%" */
export function groupSummaryText(group: ShopGroup): string {
  return `매물 ${group.items.length}개 · 최대 ${groupMaxDiscount(group)}%`;
}

/** 접혔을 때 보여줄 줄과 숨긴 수 */
export function groupPreview(
  group: ShopGroup,
  expanded: boolean,
): { visible: ListItem[]; hiddenCount: number } {
  if (expanded || group.items.length <= GROUP_PREVIEW_COUNT) {
    return { visible: group.items, hiddenCount: 0 };
  }
  return {
    visible: group.items.slice(0, GROUP_PREVIEW_COUNT),
    hiddenCount: group.items.length - GROUP_PREVIEW_COUNT,
  };
}
