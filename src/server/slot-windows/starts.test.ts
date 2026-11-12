// 시간대 매물 시작 가능 시각·상태·필터 계산 (#308). 경계와 차 있는 시간, 지난 시각을 본다.

import { describe, expect, it } from 'vitest';

import { EMPTY_FILTERS } from '@/features/map/filters';
import { kstToUtc } from '@/lib/time';

import { menusMatchingFilters, windowStarts, windowStatus } from './starts';

/** 2026-11-13(금) 한국 시간 'HH:MM' */
const at = (hm: string) => {
  const [hour, minute] = hm.split(':').map(Number);
  return kstToUtc({ year: 2026, month: 11, day: 13, hour, minute });
};
const hm = (date: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);

const WINDOW = { start: at('13:00'), end: at('18:00') };
const BEFORE = at('09:00');

describe('windowStarts', () => {
  it('#308 예: 펌 2시간, 13:00~18:00이면 시작은 30분마다 16:00까지', () => {
    const starts = windowStarts({
      window: WINDOW,
      durationMinutes: 120,
      occupied: [],
      now: BEFORE,
    });
    expect(starts.map((start) => hm(start.start))).toEqual([
      '13:00',
      '13:30',
      '14:00',
      '14:30',
      '15:00',
      '15:30',
      '16:00',
    ]);
    expect(hm(starts.at(-1)!.end)).toBe('18:00');
  });

  it('이미 차 있는 시간과 겹치는 시작은 뺀다(끝과 시작이 맞닿으면 괜찮다)', () => {
    const occupied = [{ start: at('14:00'), end: at('15:00') }];
    const starts = windowStarts({ window: WINDOW, durationMinutes: 60, occupied, now: BEFORE });
    expect(starts.map((start) => hm(start.start))).toEqual([
      '13:00',
      '15:00',
      '15:30',
      '16:00',
      '16:30',
      '17:00',
    ]);
  });

  it('지금과 같거나 지난 시작은 뺀다', () => {
    const starts = windowStarts({
      window: WINDOW,
      durationMinutes: 60,
      occupied: [],
      now: at('16:00'),
    });
    expect(starts.map((start) => hm(start.start))).toEqual(['16:30', '17:00']);
  });

  it('소요 시간이 시간대보다 길면 시작할 수 없다', () => {
    expect(
      windowStarts({ window: WINDOW, durationMinutes: 330, occupied: [], now: BEFORE }),
    ).toEqual([]);
  });
});

describe('windowStatus', () => {
  const base = {
    status: 'published' as const,
    publishAt: at('08:00'),
    window: WINDOW,
    menuDurations: [60, 120],
    occupied: [],
    now: BEFORE,
  };

  it('게시중이고 남은 시간에 들어가는 서비스가 있으면 published', () => {
    expect(windowStatus(base)).toBe('published');
  });

  it('게시 시각 전이면 scheduled, 원장님이 마감했거나 끝이 지나면 closed', () => {
    expect(windowStatus({ ...base, status: 'scheduled', publishAt: at('10:00') })).toBe(
      'scheduled',
    );
    expect(windowStatus({ ...base, status: 'scheduled', publishAt: at('08:00') })).toBe(
      'published',
    );
    expect(windowStatus({ ...base, status: 'closed' })).toBe('closed');
    expect(windowStatus({ ...base, now: at('18:00') })).toBe('closed');
  });

  it('남은 시간에 들어가는 서비스가 하나도 없으면 full(목록에서 내린다)', () => {
    const occupied = [
      { start: at('13:00'), end: at('15:00') },
      { start: at('15:30'), end: at('18:00') },
    ];
    expect(windowStatus({ ...base, occupied })).toBe('full');
  });
});

describe('menusMatchingFilters', () => {
  const menu = (serviceType: string, salePrice: number, discountRate: number, start: string) => ({
    serviceType,
    salePrice,
    discountRate,
    starts: [{ start: at(start), end: at(start) }],
  });
  const cut = menu('cut', 14_000, 30, '13:00');
  const perm = menu('perm', 56_000, 50, '18:00');

  it('필터가 없으면 모두, 있으면 서비스 중 맞는 것만 남긴다', () => {
    expect(menusMatchingFilters([cut, perm], EMPTY_FILTERS)).toEqual([cut, perm]);
    expect(menusMatchingFilters([cut, perm], { ...EMPTY_FILTERS, services: ['perm'] })).toEqual([
      perm,
    ]);
    expect(menusMatchingFilters([cut, perm], { ...EMPTY_FILTERS, prices: ['under_30k'] })).toEqual([
      cut,
    ]);
    expect(menusMatchingFilters([cut, perm], { ...EMPTY_FILTERS, minDiscount: 40 })).toEqual([
      perm,
    ]);
    expect(menusMatchingFilters([cut, perm], { ...EMPTY_FILTERS, times: ['evening'] })).toEqual([
      perm,
    ]);
  });
});
