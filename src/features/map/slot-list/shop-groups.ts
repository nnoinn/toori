// 매물을 샵별로 묶어 보여주기. 화면 없이 테스트한다.
// - 거리순 목록(11/18 정찬형): 거리순은 같은 샵 줄이 붙어 오므로(merge.ts·queries.ts) 붙어 있는 같은 샵 줄을 한 묶음으로 만든다
// - 관심 샵(예전 이름 찜한 샵, 11/15 회의 3번·C-211): 지금 매물이 있는 관심 샵마다 한 묶음. 매물이 없는 샵은 보여주지 않는다(11/18 정찬형)

import type { ListItem } from './types';

/** 접힌 묶음에서 먼저 보여주는 매물 수. 더 있으면 [매물 N개 더 보기] */
export const GROUP_PREVIEW_COUNT = 3;

/** 관심 샵 화면은 샵마다 매물을 2개까지 먼저 보여준다(C-211, docs/stage3-spec.md) */
export const INTEREST_GROUP_PREVIEW_COUNT = 2;

/** 묶음 머리 줄에 보여줄 샵 정보 */
export type ShopHeader = {
  shopId: string;
  shopName: string;
  /** 업종 이름. 예: "미용실" */
  category: string;
  /** 대표 사진. 없으면 빈 사진 칸 */
  imageUrl: string | null;
  /** 기준점에서의 거리(m). 모르면 null */
  distanceMeters: number | null;
};

export type ShopGroup = {
  shop: ShopHeader;
  /** 이 샵의 매물·시간대(받은 순서 그대로). 늘 하나 이상 */
  items: ListItem[];
};

function headerOf(item: ListItem): ShopHeader {
  return {
    shopId: item.shopId,
    shopName: item.shopName,
    category: item.category,
    imageUrl: item.imageUrl,
    distanceMeters: item.distanceMeters,
  };
}

/**
 * 붙어 있는 같은 샵 줄을 하나로 묶는다. 순서는 그대로다.
 * 같은 샵이 떨어져서 다시 나오면(거리순이 아니면 생길 수 있다) 따로 묶는다
 */
export function groupByShop(items: readonly ListItem[]): ShopGroup[] {
  const groups: ShopGroup[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && last.shop.shopId === item.shopId) last.items.push(item);
    else groups.push({ shop: headerOf(item), items: [item] });
  }
  return groups;
}

/**
 * 찜한 샵 묶음(11/15 회의 3번). 시작이 가까운 순으로 받은 매물을 샵마다 모은다.
 * 샵은 가장 빠른 매물 순서이고, 샵 안의 매물 순서는 그대로다. 매물이 없는 샵은 묶음도 없다(11/18 정찬형)
 */
export function groupByShopInOrder(items: readonly ListItem[]): ShopGroup[] {
  const byShop = new Map<string, ShopGroup>();
  for (const item of items) {
    const group = byShop.get(item.shopId);
    if (group) group.items.push(item);
    else byShop.set(item.shopId, { shop: headerOf(item), items: [item] });
  }
  return [...byShop.values()];
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

/** 접혔을 때 보여줄 줄과 숨긴 수. 먼저 보여주는 수는 화면마다 다르다(거리순 목록 3개, 관심 샵 2개) */
export function groupPreview(
  group: ShopGroup,
  expanded: boolean,
  previewCount: number = GROUP_PREVIEW_COUNT,
): { visible: ListItem[]; hiddenCount: number } {
  if (expanded || group.items.length <= previewCount) {
    return { visible: group.items, hiddenCount: 0 };
  }
  return {
    visible: group.items.slice(0, previewCount),
    hiddenCount: group.items.length - previewCount,
  };
}
