import { describe, expect, it } from 'vitest';

import type { SlotWindowDetail } from '@/server/slot-windows';

import { recentWindowItem } from './queries';

const NOW = new Date('2026-11-28T00:00:00.000Z');
const start = { startAt: '2026-11-28T03:00:00.000Z', endAt: '2026-11-28T04:00:00.000Z' };

function menu(name: string, discountRate: number, salePrice: number, open = true) {
  return {
    menuId: name,
    serviceType: 'cut' as const,
    name,
    description: null,
    durationMinutes: 60,
    listPrice: 30000,
    discountRate,
    salePrice,
    starts: open ? [start] : [],
  };
}

function windowDetail(menus: ReturnType<typeof menu>[], endAt = '2026-11-28T08:00:00.000Z') {
  return {
    windowId: 'w1',
    shop: { name: '샘플 헤어 중앙역점' },
    imageUrls: [],
    startAt: '2026-11-28T02:00:00.000Z',
    endAt,
    newCustomerOnly: false,
    menus,
    serverNow: NOW.toISOString(),
  } as unknown as SlotWindowDetail;
}

describe('최근 본 시간대 한 줄 (C-212)', () => {
  it('지금 시작할 수 있는 서비스만 세고, 가장 큰 할인율과 가장 낮은 판매가', () => {
    const item = recentWindowItem(
      windowDetail([menu('펌', 20, 60000), menu('커트', 40, 15000), menu('염색', 50, 9000, false)]),
      NOW,
    );
    expect(item).toMatchObject({
      kind: 'window',
      id: 'w1',
      shopName: '샘플 헤어 중앙역점',
      menuName: '펌',
      menuCount: 2,
      discountRate: 40,
      salePrice: 15000,
      closed: false,
    });
  });

  it('고를 수 있는 서비스가 없거나 시간대가 끝났으면 뺀다', () => {
    expect(recentWindowItem(windowDetail([menu('커트', 30, 14000, false)]), NOW)).toBeNull();
    expect(
      recentWindowItem(windowDetail([menu('커트', 30, 14000)], '2026-11-27T23:00:00.000Z'), NOW),
    ).toBeNull();
  });
});
