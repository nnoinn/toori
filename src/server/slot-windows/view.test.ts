// 시간대 매물 고객 화면 값 계산 (#308 ②). 서비스마다 시작 가능 시각, 목록 카드 요약(꽉 참·필터)을 본다.
// 시작 시각 계산 자체(30분 단위·끝·지난 시각·겹침)는 starts.test.ts가 본다.

import { describe, expect, it } from 'vitest';

import { EMPTY_FILTERS } from '@/features/map/filters';
import { kstToUtc } from '@/lib/time';

import { windowCardSummary, type WindowMenuRow, windowMenuViews } from './view';

/** 2026-11-13(금) 한국 시간 'HH:MM' */
const at = (hm: string) => {
  const [hour, minute] = hm.split(':').map(Number);
  return kstToUtc({ year: 2026, month: 11, day: 13, hour, minute });
};
const iso = (hm: string) => at(hm).toISOString();

const WINDOW = { start: at('13:00'), end: at('18:00') };
const NOW = at('09:00');

// 판매가 = 정가 × (1 − 할인율)(CLAUDE.md, S-203): 20,000원 30% → 14,000원, 80,000원 20% → 64,000원
const CUT: WindowMenuRow = {
  menuId: '11111111-1111-4111-8111-111111111111',
  serviceType: 'cut',
  name: '커트',
  description: null,
  durationMinutes: 60,
  listPrice: 20_000,
  discountRate: 30,
  salePrice: 14_000,
};
const PERM: WindowMenuRow = {
  menuId: '22222222-2222-4222-8222-222222222222',
  serviceType: 'perm',
  name: '펌',
  description: '디지털 펌',
  durationMinutes: 180,
  listPrice: 80_000,
  discountRate: 20,
  salePrice: 64_000,
};
// 20,000원 50% → 10,000원(커트보다 할인율이 크고 판매가가 낮다). 4시간이라 14:30 뒤에 시작하면 18:00 안에 끝나지 않는다
const COLOR: WindowMenuRow = {
  menuId: '33333333-3333-4333-8333-333333333333',
  serviceType: 'color',
  name: '염색',
  description: null,
  durationMinutes: 240,
  listPrice: 20_000,
  discountRate: 50,
  salePrice: 10_000,
};

describe('windowMenuViews', () => {
  it('서비스마다 올릴 때 값 그대로와, 차 있는 시간을 뺀 시작·끝 시각을 받은 순서대로 준다', () => {
    const views = windowMenuViews({
      window: WINDOW,
      menus: [CUT, PERM],
      occupied: [{ start: at('13:00'), end: at('16:00') }],
      now: NOW,
    });
    expect(views.map((view) => view.menu)).toEqual([
      {
        ...CUT,
        starts: [
          { startAt: iso('16:00'), endAt: iso('17:00') },
          { startAt: iso('16:30'), endAt: iso('17:30') },
          { startAt: iso('17:00'), endAt: iso('18:00') },
        ],
      },
      // 펌 3시간은 16:00~18:00에 들어가지 않는다
      { ...PERM, starts: [] },
    ]);
    expect(views[0].startRanges.map((range) => range.start)).toEqual([
      at('16:00'),
      at('16:30'),
      at('17:00'),
    ]);
  });
});

describe('windowCardSummary', () => {
  const views = (occupied: { start: Date; end: Date }[], now = NOW) =>
    windowMenuViews({ window: WINDOW, menus: [CUT, PERM], occupied, now });

  it('남은 시간에 들어가는 서비스만 세고, 가장 큰 할인율·가장 낮은 판매가·가장 빠른 시작을 준다', () => {
    expect(windowCardSummary(views([]), EMPTY_FILTERS)).toEqual({
      menuCount: 2,
      firstMenuName: '커트',
      maxDiscountRate: 30,
      minSalePrice: 14_000,
      earliestStart: at('13:00'),
    });
    // 13:00~16:00이 차면 펌은 들어가지 않아서 커트만 센다
    expect(
      windowCardSummary(views([{ start: at('13:00'), end: at('16:00') }]), EMPTY_FILTERS),
    ).toEqual({
      menuCount: 1,
      firstMenuName: '커트',
      maxDiscountRate: 30,
      minSalePrice: 14_000,
      earliestStart: at('16:00'),
    });
    // 들어가지 않는 서비스(염색 50%·10,000원)는 첫 서비스·할인율·판매가에서도 뺀다
    const colorFull = windowMenuViews({
      window: WINDOW,
      menus: [COLOR, CUT],
      occupied: [{ start: at('13:00'), end: at('14:30') }],
      now: NOW,
    });
    expect(windowCardSummary(colorFull, EMPTY_FILTERS)).toEqual({
      menuCount: 1,
      firstMenuName: '커트',
      maxDiscountRate: 30,
      minSalePrice: 14_000,
      earliestStart: at('14:30'),
    });
  });

  it('남은 시간에 들어가는 서비스가 없으면(꽉 참) null', () => {
    expect(
      windowCardSummary(views([{ start: at('13:00'), end: at('18:00') }]), EMPTY_FILTERS),
    ).toBeNull();
    // 끝나기 1시간 전(17:00)이 지나면 커트도 들어가지 않는다
    expect(windowCardSummary(views([], at('17:00')), EMPTY_FILTERS)).toBeNull();
  });

  it('필터는 보일지만 정한다: 남은 서비스 중 하나라도 맞으면 보이고, 맞는 것이 없으면 null', () => {
    expect(windowCardSummary(views([]), { ...EMPTY_FILTERS, services: ['perm'] })).toMatchObject({
      menuCount: 2,
    });
    expect(windowCardSummary(views([]), { ...EMPTY_FILTERS, services: ['color'] })).toBeNull();
    // 펌이 들어가지 않으면 펌 필터에는 맞는 서비스가 없다
    expect(
      windowCardSummary(views([{ start: at('13:00'), end: at('16:00') }]), {
        ...EMPTY_FILTERS,
        services: ['perm'],
      }),
    ).toBeNull();
    expect(windowCardSummary(views([]), { ...EMPTY_FILTERS, minDiscount: 40 })).toBeNull();
  });
});
