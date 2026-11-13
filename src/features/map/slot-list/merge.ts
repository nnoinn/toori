// 지금 매물과 시간대 매물(#308)을 한 목록·한 지도로 섞는다. 화면 없이 테스트한다.
// 매물은 DB가 정렬해 오고, 시간대(listSlotWindows)는 범위 안 것을 모두 받아 여기서 같은 순서로 끼워 넣는다.
// 정렬 값: 거리순은 샵 거리, 할인율순은 할인율(시간대는 서비스 중 가장 큰 할인율), 임박순은 시작 시각(시간대는 가장 빠른 시작).
// 같은 정렬 값끼리는 id 오름차순이다. DB의 uuid 순서는 소문자 uuid 글자를 앞에서부터 비교한 순서와 같다.

import type { MapShop } from '../types';
import type { SlotCursor } from './cursor';
import type { SlotSort } from './sort';

/** 한 줄의 정렬 값. near: 거리(m), discount: 할인율(%), imminent: 시작 시각(ms) */
export type SortKey = { value: number; id: string };

export type Keyed<T> = { key: SortKey; item: T };

/** 목록 순서에서 a가 b보다 앞이면 음수 */
export function compareKeys(sort: SlotSort, a: SortKey, b: SortKey): number {
  const byValue = sort === 'discount' ? b.value - a.value : a.value - b.value;
  if (byValue !== 0) return byValue;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** 커서(마지막으로 본 한 줄) → 정렬 값 */
export function cursorKey(cursor: SlotCursor): SortKey {
  return {
    value: cursor.sort === 'imminent' ? new Date(cursor.value).getTime() : Number(cursor.value),
    id: cursor.id,
  };
}

/** 정렬 값 → 커서 */
export function keyCursor(sort: SlotSort, key: SortKey): SlotCursor {
  return {
    sort,
    value: sort === 'imminent' ? new Date(key.value).toISOString() : key.value,
    id: key.id,
  };
}

/**
 * 목록 한 쪽. slots는 DB가 정렬해 커서 뒤부터 (size + 1)개까지 가져온 매물, windows는 범위 안 시간대 전체다.
 * 시간대는 커서 뒤의 것만 남기고 매물과 섞어 앞에서 size개를 준다.
 * 매물을 size + 1개까지만 가져와도 앞 size개는 정확하다(그 안에 들어갈 매물은 모두 가져온 것 안에 있다).
 * 남은 매물이나 시간대가 있으면 마지막 줄을 다음 커서로 준다
 */
export function mergePage<T>(input: {
  sort: SlotSort;
  slots: Keyed<T>[];
  windows: Keyed<T>[];
  cursor: SlotCursor | null;
  size: number;
}): { items: T[]; nextCursor: SlotCursor | null } {
  const { sort, cursor, size } = input;
  const after = cursor ? cursorKey(cursor) : null;
  const windows = after
    ? input.windows.filter((entry) => compareKeys(sort, entry.key, after) > 0)
    : input.windows;
  const merged = [...input.slots, ...windows].sort((a, b) => compareKeys(sort, a.key, b.key));
  const page = merged.slice(0, size);
  const last = page.at(-1);
  return {
    items: page.map((entry) => entry.item),
    nextCursor: merged.length > size && last ? keyCursor(sort, last.key) : null,
  };
}

/** 지도 핀에 더할 시간대 하나 */
export type WindowPin = {
  shopId: string;
  shopName: string;
  lat: number;
  lng: number;
  category: NonNullable<MapShop['category']>;
  sigunguCode: string;
};

/**
 * 지도 핀(샵별 매물 수)에 시간대를 1개씩 더한다. 매물이 없고 시간대만 있는 샵은 새 핀이 된다.
 * 매물 많은 순(같으면 샵 id 순)으로 다시 세워 상한까지 준다(selectMapShops와 같은 순서)
 */
export function addWindowPins(shops: MapShop[], windows: WindowPin[], limit: number): MapShop[] {
  if (windows.length === 0) return shops;
  const byShop = new Map(shops.map((shop) => [shop.shopId, { ...shop }]));
  for (const window of windows) {
    const pin = byShop.get(window.shopId);
    if (pin) {
      pin.slotCount += 1;
      continue;
    }
    byShop.set(window.shopId, {
      shopId: window.shopId,
      name: window.shopName,
      lat: window.lat,
      lng: window.lng,
      slotCount: 1,
      category: window.category,
      sigunguCode: window.sigunguCode,
    });
  }
  return [...byShop.values()]
    .sort(
      (a, b) =>
        b.slotCount - a.slotCount || (a.shopId < b.shopId ? -1 : a.shopId > b.shopId ? 1 : 0),
    )
    .slice(0, limit);
}
