// 매물과 시간대 매물(#308)을 섞는 순서. 기댓값 출처: 정렬(C-205: 거리순·할인율순·임박순),
// 시간대 정렬 값(#308 고객 화면 계획: 거리순은 샵 거리, 할인율순은 최대 할인율, 임박순은 가장 빠른 시작), 20개씩 이어 불러오기(D8)

import { describe, expect, it } from 'vitest';

import type { MapShop } from '../types';
import type { SlotCursor } from './cursor';
import {
  addWindowPins,
  cursorKey,
  type Keyed,
  keyCursor,
  mergePage,
  type WindowPin,
} from './merge';
import type { SlotSort } from './sort';

// id는 uuid 모양(소문자). 끝 숫자로 순서를 알 수 있게 한다
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const entry = (value: number, n: number): Keyed<string> => ({
  key: { value, id: uuid(n) },
  item: uuid(n),
});

describe('매물과 시간대 섞기', () => {
  it('거리순: 가까운 순, 거리가 같으면 id 순(같은 샵의 매물과 시간대)', () => {
    const { items } = mergePage({
      sort: 'near',
      slots: [entry(100, 3), entry(500, 1)],
      windows: [entry(100, 2), entry(300, 4)],
      cursor: null,
      size: 20,
    });
    expect(items).toEqual([uuid(2), uuid(3), uuid(4), uuid(1)]);
  });

  it('할인율순: 큰 순(시간대는 최대 할인율), 같으면 id 순', () => {
    const { items } = mergePage({
      sort: 'discount',
      slots: [entry(50, 2), entry(30, 3)],
      windows: [entry(30, 1), entry(40, 4)],
      cursor: null,
      size: 20,
    });
    expect(items).toEqual([uuid(2), uuid(4), uuid(1), uuid(3)]);
  });

  it('임박순: 시작이 빠른 순(시간대는 가장 빠른 시작)', () => {
    const t = (hour: number) => Date.UTC(2026, 10, 14, hour);
    const { items } = mergePage({
      sort: 'imminent',
      slots: [entry(t(10), 1), entry(t(15), 2)],
      windows: [entry(t(13), 3)],
      cursor: null,
      size: 20,
    });
    expect(items).toEqual([uuid(1), uuid(3), uuid(2)]);
  });

  it('다 들어가면 다음 커서가 없고, 남은 시간대가 있으면 매물이 모자라도 커서를 준다', () => {
    const all = mergePage({
      sort: 'near',
      slots: [entry(1, 1)],
      windows: [entry(2, 2)],
      cursor: null,
      size: 2,
    });
    expect(all.nextCursor).toBeNull();
    const more = mergePage({
      sort: 'near',
      slots: [entry(1, 1)],
      windows: [entry(2, 2), entry(3, 3)],
      cursor: null,
      size: 2,
    });
    expect(more.items).toEqual([uuid(1), uuid(2)]);
    expect(more.nextCursor).toEqual({ sort: 'near', value: 2, id: uuid(2) });
  });

  // DB처럼 커서 뒤 매물을 (size + 1)개까지만 주고, 끝까지 이어 불러와 본다
  function readAll(sort: SlotSort, slots: Keyed<string>[], windows: Keyed<string>[], size: number) {
    const compare = (a: Keyed<string>, b: Keyed<string>) =>
      (sort === 'discount' ? b.key.value - a.key.value : a.key.value - b.key.value) ||
      (a.key.id < b.key.id ? -1 : a.key.id > b.key.id ? 1 : 0);
    const sorted = [...slots].sort(compare);
    const pages: string[][] = [];
    let cursor: SlotCursor | null = null;
    for (let guard = 0; guard < 20; guard += 1) {
      const after: Keyed<string>['key'] | null = cursor ? cursorKey(cursor) : null;
      const dbRows = sorted
        .filter((row) => !after || compare(row, { key: after, item: '' }) > 0)
        .slice(0, size + 1);
      const result: { items: string[]; nextCursor: SlotCursor | null } = mergePage({
        sort,
        slots: dbRows,
        windows,
        cursor,
        size,
      });
      pages.push(result.items);
      cursor = result.nextCursor;
      if (!cursor) break;
    }
    return pages;
  }

  it('20개씩 이어 불러오면 매물과 시간대가 빠지거나 겹치지 않고, 한 줄로 정렬된 순서 그대로다', () => {
    // 매물 25개와 시간대 7개. 거리·할인율이 같은 것끼리 섞여 있다
    const slots = Array.from({ length: 25 }, (_, i) => entry([10, 20, 30, 40, 50][i % 5], i + 1));
    const windows = Array.from({ length: 7 }, (_, i) => entry([20, 30, 50][i % 3], 100 + i));
    for (const sort of ['near', 'discount'] as const) {
      const pages = readAll(sort, slots, windows, 20);
      expect(pages.map((page) => page.length)).toEqual([20, 12]);
      const expected = mergePage({ sort, slots, windows, cursor: null, size: 100 }).items;
      expect(pages.flat()).toEqual(expected);
      expect(new Set(pages.flat()).size).toBe(32);
    }
  });

  it('임박순 커서는 시작 시각(ISO)으로 주고받는다', () => {
    const at = Date.UTC(2026, 10, 14, 4, 30);
    const cursor = keyCursor('imminent', { value: at, id: uuid(1) });
    expect(cursor).toEqual({ sort: 'imminent', value: '2026-11-14T04:30:00.000Z', id: uuid(1) });
    expect(cursorKey(cursor)).toEqual({ value: at, id: uuid(1) });
  });
});

describe('지도 핀에 시간대 더하기', () => {
  const shop = (n: number, slotCount: number): MapShop => ({
    shopId: uuid(n),
    name: `샵 ${n}`,
    lat: 37.3,
    lng: 126.8,
    slotCount,
    category: 'hair',
    sigunguCode: '41273',
  });
  const pin = (n: number): WindowPin => ({
    shopId: uuid(n),
    shopName: `샵 ${n}`,
    lat: 37.31,
    lng: 126.81,
    category: 'nail_lash',
    sigunguCode: '41271',
  });

  it('매물이 있는 샵은 매물 수에 1을 더하고, 시간대만 있는 샵은 매물 1개 핀이 된다', () => {
    const result = addWindowPins([shop(1, 2), shop(2, 1)], [pin(2), pin(3)], 300);
    expect(result.map((item) => [item.shopId, item.slotCount])).toEqual([
      [uuid(1), 2],
      [uuid(2), 2],
      [uuid(3), 1],
    ]);
    expect(result[2]).toEqual({
      shopId: uuid(3),
      name: '샵 3',
      lat: 37.31,
      lng: 126.81,
      slotCount: 1,
      category: 'nail_lash',
      sigunguCode: '41271',
    });
  });

  it('매물 많은 순으로 다시 세우고 상한까지만 준다. 받은 핀은 바꾸지 않는다', () => {
    const before = [shop(1, 1), shop(2, 1)];
    const result = addWindowPins(before, [pin(2)], 1);
    expect(result.map((item) => item.shopId)).toEqual([uuid(2)]);
    expect(before[1].slotCount).toBe(1);
  });
});
