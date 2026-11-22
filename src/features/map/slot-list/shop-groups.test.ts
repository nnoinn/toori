import { describe, expect, it } from 'vitest';

import {
  GROUP_PREVIEW_COUNT,
  groupByShop,
  groupByShopInOrder,
  groupPreview,
  groupSummaryText,
} from './shop-groups';
import type { ListItem } from './types';

// 거리순 목록 샵별 묶기(11/18 정찬형): 붙어 있는 같은 샵 줄을 한 묶음으로, 3개 넘으면 접기
const slot = (id: string, shopId: string, discountRate = 30): ListItem => ({
  kind: 'slot',
  slotId: id,
  shopId,
  shopName: `샵 ${shopId}`,
  category: '미용실',
  menuName: '커트',
  startAt: '2026-11-19T02:00:00.000Z',
  listPrice: 20000,
  salePrice: 20000 * (1 - discountRate / 100),
  discountRate,
  imageUrl: null,
  distanceMeters: 100,
  badges: [],
});
const window = (id: string, shopId: string, maxDiscountRate: number): ListItem => ({
  kind: 'window',
  windowId: id,
  shopId,
  shopName: `샵 ${shopId}`,
  category: '미용실',
  firstMenuName: '커트',
  menuCount: 2,
  startAt: '2026-11-19T04:00:00.000Z',
  endAt: '2026-11-19T09:00:00.000Z',
  maxDiscountRate,
  minSalePrice: 10000,
  imageUrl: null,
  distanceMeters: 100,
  badges: [],
});
const ids = (items: ListItem[]) =>
  items.map((item) => (item.kind === 'slot' ? item.slotId : item.windowId));

describe('샵별 묶기', () => {
  it('붙어 있는 같은 샵 줄을 한 묶음으로, 순서는 그대로', () => {
    const groups = groupByShop([
      slot('1', 'a'),
      slot('2', 'a'),
      window('w', 'b', 40),
      slot('3', 'b'),
    ]);
    expect(groups.map((group) => [group.shop.shopId, ids(group.items)])).toEqual([
      ['a', ['1', '2']],
      ['b', ['w', '3']],
    ]);
  });

  it('같은 샵이 떨어져서 다시 나오면 따로 묶는다', () => {
    const groups = groupByShop([slot('1', 'a'), slot('2', 'b'), slot('3', 'a')]);
    expect(groups.map((group) => group.shop.shopId)).toEqual(['a', 'b', 'a']);
  });

  it('빈 목록은 묶음도 없다', () => {
    expect(groupByShop([])).toEqual([]);
  });

  it('요약은 매물 수와 가장 큰 할인율(시간대는 최대 할인율)', () => {
    const [group] = groupByShop([slot('1', 'a', 10), window('w', 'a', 40), slot('2', 'a', 20)]);
    expect(groupSummaryText(group)).toBe('매물 3개 · 최대 40%');
  });

  it(`${GROUP_PREVIEW_COUNT}개까지는 다 보여주고, 넘으면 앞 ${GROUP_PREVIEW_COUNT}개와 숨긴 수`, () => {
    const [three] = groupByShop([slot('1', 'a'), slot('2', 'a'), slot('3', 'a')]);
    expect(groupPreview(three, false)).toEqual({ visible: three.items, hiddenCount: 0 });
    const [five] = groupByShop(['1', '2', '3', '4', '5'].map((id) => slot(id, 'a')));
    const folded = groupPreview(five, false);
    expect(ids(folded.visible)).toEqual(['1', '2', '3']);
    expect(folded.hiddenCount).toBe(2);
    expect(groupPreview(five, true)).toEqual({ visible: five.items, hiddenCount: 0 });
  });
});

// 찜한 샵(11/15 회의 3번): 매물이 있는 찜한 샵마다 한 묶음(매물 없는 샵은 숨김, 11/18)
describe('찜한 샵 묶기', () => {
  it('시작이 가까운 순으로 받은 매물을 샵마다 모으고, 샵은 가장 빠른 매물 순', () => {
    // 매물은 시작이 가까운 순: c, a, c(시간대), a, b
    const groups = groupByShopInOrder([
      slot('1', 'c'),
      slot('2', 'a'),
      window('w', 'c', 40),
      slot('3', 'a'),
      slot('4', 'b'),
    ]);
    expect(groups.map((group) => [group.shop.shopId, ids(group.items)])).toEqual([
      ['c', ['1', 'w']],
      ['a', ['2', '3']],
      ['b', ['4']],
    ]);
  });

  it('매물이 없으면 묶음도 없다(매물 없는 찜한 샵은 보여주지 않는다)', () => {
    expect(groupByShopInOrder([])).toEqual([]);
  });
});
