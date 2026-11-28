import { describe, expect, it } from 'vitest';

import { EMPTY_FILTERS, parseFilters, QUICK_MIN_DISCOUNT } from '@/features/map/filters';
import { parseSort } from '@/features/map/slot-list/sort';
import type { ListItem } from '@/features/map/slot-list/types';

import { favoriteSummaryText, LIST_PATH, LOBBY_TILES, withoutShown } from './lobby-rules';

// 고객 홈(로비) 바로가기와 관심 샵 상자 문구 (11/15 회의 6번, 11/20 정찬형 A안, C-211)

/** 바로가기 주소를 매물 목록이 읽는 대로 읽는다 */
function readListHref(href: string) {
  const url = new URL(href, 'https://toori.test');
  const params = Object.fromEntries(url.searchParams.entries());
  return { path: url.pathname, filters: parseFilters(params), sort: parseSort(params.sort) };
}

function tile(key: string) {
  const found = LOBBY_TILES.find((t) => t.key === key);
  if (!found) throw new Error(`바로가기 ${key} 없음`);
  return found;
}

describe('바로가기 칸', () => {
  it('8칸이고(4칸 2줄) 순서는 화면 4개 → 업종 2개 → 할인율 → 곧 시작', () => {
    expect(LOBBY_TILES.map((t) => t.label)).toEqual([
      '매물 목록',
      '지도',
      '관심',
      '내 예약',
      '미용실',
      '네일·속눈썹',
      `${QUICK_MIN_DISCOUNT}% 이상`,
      '곧 시작',
    ]);
  });

  it('화면 바로가기는 그 화면 주소로 간다', () => {
    expect(tile('list').href).toBe(LIST_PATH);
    expect(tile('map').href).toBe('/home/map');
    expect(tile('favorites').href).toBe('/home/favorites');
    expect(tile('reservations').href).toBe('/reservations');
  });

  it('업종 바로가기를 매물 목록이 읽으면 그 업종만 고른 필터다(다른 필터·정렬은 기본)', () => {
    expect(readListHref(tile('hair').href)).toEqual({
      path: LIST_PATH,
      filters: { ...EMPTY_FILTERS, category: 'hair' },
      sort: 'near',
    });
    expect(readListHref(tile('nail_lash').href)).toEqual({
      path: LIST_PATH,
      filters: { ...EMPTY_FILTERS, category: 'nail_lash' },
      sort: 'near',
    });
  });

  it('할인율 바로가기는 빠른 고르기 칩과 같은 "N% 이상"이다', () => {
    expect(readListHref(tile('discount').href)).toEqual({
      path: LIST_PATH,
      filters: { ...EMPTY_FILTERS, minDiscount: QUICK_MIN_DISCOUNT },
      sort: 'near',
    });
  });

  it('"곧 시작"은 필터 없이 임박순이다', () => {
    expect(readListHref(tile('imminent').href)).toEqual({
      path: LIST_PATH,
      filters: EMPTY_FILTERS,
      sort: 'imminent',
    });
  });
});

describe('관심 샵 상자 문구 (C-211)', () => {
  const item = (shopId: string, id: string) => ({ kind: 'slot', shopId, slotId: id }) as ListItem;

  it('관심 샵이 없으면 없다고 한다', () => {
    expect(favoriteSummaryText(0, [])).toBe('아직 관심 샵이 없어요');
  });

  it('관심 샵은 있는데 지금 매물이 없으면 관심 샵 수와 함께 없다고 한다', () => {
    expect(favoriteSummaryText(3, [])).toBe('관심 샵 3곳에 지금 올라온 매물이 없어요');
  });

  it('매물이 있으면 매물이 있는 샵 수(관심 샵 수가 아니라)와 매물 수', () => {
    const items = [item('a', '1'), item('a', '2'), item('b', '3')];
    expect(favoriteSummaryText(5, items)).toBe('관심 샵 2곳에 지금 매물 3개');
  });
});

describe('많이 할인하는 매물 칸', () => {
  const slot = (id: string) => ({ kind: 'slot', shopId: 's', slotId: id }) as ListItem;
  const window = (id: string) => ({ kind: 'window', shopId: 's', windowId: id }) as ListItem;

  it('위 칸에 이미 나온 매물·시간대는 빼고, 받은 순서(할인율이 큰 순) 그대로 count개', () => {
    const discount = [slot('a'), window('w'), slot('b'), slot('c'), slot('d'), slot('e')];
    const imminent = [slot('a'), window('w'), slot('x')];
    expect(
      withoutShown(discount, imminent, 3).map((i) => (i.kind === 'slot' ? i.slotId : i.windowId)),
    ).toEqual(['b', 'c', 'd']);
  });

  it('같은 ID라도 매물과 시간대는 다른 줄로 본다', () => {
    expect(withoutShown([window('a')], [slot('a')], 3)).toHaveLength(1);
  });

  it('남는 매물이 없으면 빈 목록(칸을 그리지 않는다)', () => {
    expect(withoutShown([slot('a')], [slot('a')], 3)).toEqual([]);
  });
});
