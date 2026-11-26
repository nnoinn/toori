// 고객 홈(로비, /home)의 바로가기 칸과 매물 칸 규칙 (11/15 회의 6번·1번, 11/20 정찬형 A안).
// 바로가기의 필터·정렬은 매물 목록 주소창 값(filters.ts·sort.ts)으로 만들어서, 목록이 같은 값으로 읽는다.
// 업종·할인율은 정책값에서 가져온다(화면에 숫자를 직접 쓰지 않는다)

import {
  applyFiltersToSearch,
  EMPTY_FILTERS,
  QUICK_MIN_DISCOUNT,
  selectCategory,
  selectMinDiscount,
} from '@/features/map/filters';
import { type ListItem, listItemKey } from '@/features/map/slot-list/types';
import { applySortToSearch, type SlotSort } from '@/features/map/slot-list/sort';
import { SHOP_CATEGORIES, type ShopCategory } from '@/server/policy';

export const LIST_PATH = '/home/list';

/** 매물 목록 주소. 주소창 값이 없으면 /home/list */
export function listHref(search: URLSearchParams): string {
  const query = search.toString();
  return query ? `${LIST_PATH}?${query}` : LIST_PATH;
}

/** 그 업종만 고른 매물 목록. 예: /home/list?category=hair */
export function categoryListHref(category: ShopCategory): string {
  return listHref(
    applyFiltersToSearch(new URLSearchParams(), selectCategory(EMPTY_FILTERS, category)),
  );
}

/** 그 정렬로 연 매물 목록. 기본 정렬(거리순)이면 /home/list */
export function sortedListHref(sort: SlotSort): string {
  return listHref(applySortToSearch(new URLSearchParams(), sort));
}

/** 빠른 고르기 칩과 같은 "N% 이상" 매물 목록 */
export const DISCOUNT_LIST_HREF = listHref(
  applyFiltersToSearch(new URLSearchParams(), selectMinDiscount(EMPTY_FILTERS, QUICK_MIN_DISCOUNT)),
);

export type LobbyTileKey =
  'list' | 'map' | 'favorites' | 'reservations' | ShopCategory | 'discount' | 'imminent';

/**
 * 바로가기 칸 8개(당근 웹처럼, 4칸 2줄). 앞 4칸은 화면, 뒤 4칸은 필터·정렬을 건 매물 목록이다.
 * "곧 시작"은 임박순이다(매물 목록에 날짜 필터가 없어서 "오늘 매물" 대신, 11/20 정찬형)
 */
export const LOBBY_TILES: readonly { key: LobbyTileKey; label: string; href: string }[] = [
  { key: 'list', label: '매물 목록', href: LIST_PATH },
  { key: 'map', label: '지도', href: '/home/map' },
  { key: 'favorites', label: '찜한 샵', href: '/home/favorites' },
  { key: 'reservations', label: '내 예약', href: '/reservations' },
  ...SHOP_CATEGORIES.map((category) => ({
    key: category.key,
    label: category.label,
    href: categoryListHref(category.key),
  })),
  { key: 'discount', label: `${QUICK_MIN_DISCOUNT}% 이상`, href: DISCOUNT_LIST_HREF },
  { key: 'imminent', label: '곧 시작', href: sortedListHref('imminent') },
];

/** 매물 칸에 보여 줄 줄 수. 폰은 두 칸 모두 PHONE_ROW_COUNT줄까지 */
export const LOBBY_ROW_COUNT = { imminent: 5, discount: 3 } as const;
export const PHONE_ROW_COUNT = 3;

/**
 * 아래 칸(많이 할인하는 매물)에 보여 줄 줄. 위 칸(곧 시작하는 매물)에 이미 나온 매물·시간대는 빼고 앞에서부터 count개.
 * 같은 매물이 두 칸에 겹쳐 보이지 않게 한다(11/20 정찬형). 받은 순서(할인율이 큰 순)는 그대로다
 */
export function withoutShown(
  items: readonly ListItem[],
  shown: readonly ListItem[],
  count: number,
): ListItem[] {
  const shownKeys = new Set(shown.map(listItemKey));
  return items.filter((item) => !shownKeys.has(listItemKey(item))).slice(0, count);
}

/** 찜한 샵 상자 문구. 지금 예약할 수 있는 매물이 있는 찜한 샵 수와 매물 수(시간대는 1개로 센다) */
export function favoriteSummaryText(shopCount: number, items: readonly ListItem[]): string {
  if (shopCount === 0) return '아직 찜한 샵이 없어요';
  const withItems = new Set(items.map((item) => item.shopId)).size;
  if (withItems === 0) return `찜한 샵 ${shopCount}곳에 지금 올라온 매물이 없어요`;
  return `찜한 샵 ${withItems}곳에 지금 매물 ${items.length}개`;
}
