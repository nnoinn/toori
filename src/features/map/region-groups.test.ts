import { describe, expect, it } from 'vitest';

import { groupShopsByRegion } from './region-groups';
import { findRegion } from './regions';
import type { MapShop } from './types';

const shop = (
  id: string,
  sigunguCode: string | undefined,
  slotCount: number,
  lat = 37.3,
  lng = 126.8,
): MapShop => ({
  shopId: id,
  name: id,
  lat,
  lng,
  slotCount,
  sigunguCode,
});

describe('구 단위 묶음 (#204)', () => {
  it('시·군·구마다 매물 수를 더하고, 위치는 그 구의 중심', () => {
    const groups = groupShopsByRegion([
      shop('a', '41273', 3),
      shop('b', '41273', 2),
      shop('c', '41271', 4),
    ]);
    expect(groups).toEqual([
      { code: '41273', name: '단원구', center: findRegion('41273')!.center, count: 5 },
      { code: '41271', name: '상록구', center: findRegion('41271')!.center, count: 4 },
    ]);
  });

  it('묶음 숫자를 모두 더하면 목록의 매물 수와 같다', () => {
    const shops = [shop('a', '41273', 3), shop('b', '41271', 1), shop('c', '41273', 6)];
    const total = shops.reduce((sum, s) => sum + s.slotCount, 0);
    expect(groupShopsByRegion(shops).reduce((sum, g) => sum + g.count, 0)).toBe(total);
  });

  it('동네 목록에 없는 구는 이름 없이 그 구 샵들의 가운데에(목록에 없는 코드)', () => {
    const [group] = groupShopsByRegion([
      shop('a', '99999', 1, 37.5, 127.0),
      shop('b', '99999', 1, 37.6, 127.2),
    ]);
    expect(group.name).toBeNull();
    expect(group.center.lat).toBeCloseTo(37.55, 6);
    expect(group.center.lng).toBeCloseTo(127.1, 6);
  });

  it('매물 많은 구부터, 같으면 시·군·구 코드 순', () => {
    const groups = groupShopsByRegion([
      shop('a', '41271', 1),
      shop('b', '41273', 3),
      shop('c', '41390', 1),
    ]);
    expect(groups.map((group) => [group.code, group.count])).toEqual([
      ['41273', 3],
      ['41271', 1],
      ['41390', 1],
    ]);
  });

  it('구를 모르는 샵은 묶지 않는다', () => {
    expect(groupShopsByRegion([shop('a', undefined, 2)])).toEqual([]);
  });
});
