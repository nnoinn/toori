import { describe, expect, it } from 'vitest';

import {
  allTabSections,
  countByStatus,
  type DashboardSlot,
  type DashboardWindow,
  mergeEntries,
  onHold,
  splitByDay,
  viewStatus,
} from './dashboard';
import { startOfKstDay } from '@/lib/time';

// 한국 시간 10/31 낮 12시
const now = new Date('2026-10-31T12:00:00+09:00');
const kst = (iso: string) => new Date(`${iso}+09:00`).toISOString();

const slot = (start: string, extra: Partial<DashboardSlot> = {}): DashboardSlot => ({
  kind: 'slot',
  id: start,
  status: 'published',
  startAt: kst(start),
  endAt: kst(start),
  publishAt: kst('2026-10-30T00:00:00'),
  menuName: '커트',
  listPrice: 20000,
  salePrice: 14000,
  discountRate: 30,
  newCustomerOnly: false,
  holdCustomerId: null,
  holdExpiresAt: null,
  closeReason: null,
  windowId: null,
  reservationId: null,
  reservationCode: null,
  relistedSlotId: null,
  ...extra,
});

describe('대시보드 날짜 나누기 (S-401)', () => {
  it('오늘 0시는 한국 날짜 기준', () => {
    expect(startOfKstDay(now).toISOString()).toBe(kst('2026-10-31T00:00:00'));
    // UTC로는 아직 10/30 15시지만 한국은 10/31 0시
    expect(startOfKstDay(new Date('2026-10-30T15:00:00Z')).toISOString()).toBe(
      kst('2026-10-31T00:00:00'),
    );
  });

  it('오늘 0시~자정 전은 오늘, 그 뒤는 예정, 오늘 0시 전은 뺀다', () => {
    const result = splitByDay(
      [
        slot('2026-10-30T23:30:00'),
        slot('2026-10-31T00:00:00'),
        slot('2026-10-31T23:30:00'),
        slot('2026-11-01T00:00:00'),
        slot('2026-11-02T10:00:00'),
      ],
      now,
    );
    expect(result.today.map((s) => s.id)).toEqual(['2026-10-31T00:00:00', '2026-10-31T23:30:00']);
    expect(result.upcoming.map((s) => s.id)).toEqual([
      '2026-11-01T00:00:00',
      '2026-11-02T10:00:00',
    ]);
  });
});

describe('대시보드 상태 (O1 getSlotStatus)', () => {
  it('시작이 지난 게시중은 마감, 게시 시각 전 예약대기는 예약대기', () => {
    expect(viewStatus(slot('2026-10-31T09:00:00'), now)).toBe('closed');
    expect(
      viewStatus(
        slot('2026-11-02T09:00:00', { status: 'scheduled', publishAt: kst('2026-10-31T09:00:01') }),
        now,
      ),
    ).toBe('published');
    expect(
      viewStatus(
        slot('2026-11-02T13:00:00', { status: 'scheduled', publishAt: kst('2026-10-31T13:00:00') }),
        now,
      ),
    ).toBe('scheduled');
  });

  it('상태별 개수를 화면 상태로 센다', () => {
    const counts = countByStatus(
      [
        slot('2026-10-31T09:00:00'),
        slot('2026-10-31T15:00:00'),
        slot('2026-10-31T16:00:00', { status: 'reserved' }),
        slot('2026-10-31T17:00:00', { status: 'cancelled' }),
      ],
      now,
    );
    expect(counts).toEqual({
      scheduled: 0,
      published: 1,
      reserved: 1,
      closed: 1,
      cancelled: 1,
      completed: 0,
    });
  });

  it('홀딩은 만료 전에만', () => {
    const held = slot('2026-10-31T15:00:00', {
      holdCustomerId: 'c1',
      holdExpiresAt: kst('2026-10-31T12:05:00'),
    });
    expect(onHold(held, now)).toBe(true);
    expect(onHold({ ...held, holdExpiresAt: kst('2026-10-31T11:59:00') }, now)).toBe(false);
  });
});

/** 그날 from 시각부터 30분 간격으로 count개 매물(시작 시각이 id) */
const series = (day: string, from: string, count: number, extra: Partial<DashboardSlot> = {}) =>
  Array.from({ length: count }, (_, i) => {
    const start = new Date(`${day}T${from}:00+09:00`).getTime() + i * 30 * 60 * 1000;
    const iso = new Date(start + 9 * 60 * 60 * 1000).toISOString().slice(0, 19);
    return slot(iso, extra);
  });

describe('대시보드 [전체] 탭 구역 (#358)', () => {
  it('오늘·예정 구역마다 7개까지 시작 순서로 보이고, 남은 수는 [더보기]로 넘긴다', () => {
    const today = series('2026-10-31', '13:00', 9);
    const upcoming = series('2026-11-01', '10:00', 7);
    const sections = allTabSections(splitByDay([...today, ...upcoming], now), 'all', now);

    expect(sections.map((s) => [s.day, s.total, s.shown.length, s.more])).toEqual([
      ['today', 9, 7, 2],
      // 딱 7개면 남는 것이 없다([더보기] 없음)
      ['upcoming', 7, 7, 0],
    ]);
    expect(sections[0].shown.map((s) => s.id)).toEqual(today.slice(0, 7).map((s) => s.id));
    expect(sections[0].shown.at(-1)?.id).toBe('2026-10-31T16:00:00');
  });

  it('상태 필터로 거른 뒤에 7개를 세고, 매물이 없는 구역도 빈 구역으로 돌려준다', () => {
    const reserved = slot('2026-10-31T12:30:00', { status: 'reserved' });
    const published = series('2026-10-31', '13:00', 8);
    const byDay = splitByDay([reserved, ...published, ...series('2026-11-01', '10:00', 2)], now);

    // 앞의 예약됨 매물을 빼고 게시중 8개 중 7개
    const publishedOnly = allTabSections(byDay, 'published', now);
    expect(publishedOnly.map((s) => [s.day, s.total, s.shown.length, s.more])).toEqual([
      ['today', 8, 7, 1],
      ['upcoming', 2, 2, 0],
    ]);
    expect(publishedOnly[0].shown.every((s) => viewStatus(s, now) === 'published')).toBe(true);

    const reservedOnly = allTabSections(byDay, 'reserved', now);
    expect(reservedOnly.map((s) => [s.day, s.total, s.shown.map((x) => x.id), s.more])).toEqual([
      ['today', 1, ['2026-10-31T12:30:00'], 0],
      ['upcoming', 0, [], 0],
    ]);
  });
});

/** 시간대 매물 한 줄(#308). 상태는 서버가 계산해 넘긴 값 */
const windowEntry = (
  start: string,
  end: string,
  extra: Partial<DashboardWindow> = {},
): DashboardWindow => ({
  kind: 'window',
  id: `window-${start}`,
  startAt: kst(start),
  endAt: kst(end),
  publishAt: kst('2026-10-30T00:00:00'),
  state: 'published',
  closeReason: null,
  newCustomerOnly: false,
  menus: [{ name: '커트', discountRate: 30 }],
  ...extra,
});

describe('대시보드 시간대 매물 (#308)', () => {
  it('시간대 상태는 매물 상태 이름으로 센다: 남은 시간에 들어가는 서비스가 없어도(full) 게시중', () => {
    expect(
      viewStatus(
        windowEntry('2026-11-02T10:00:00', '2026-11-02T12:00:00', { state: 'scheduled' }),
        now,
      ),
    ).toBe('scheduled');
    expect(viewStatus(windowEntry('2026-10-31T13:00:00', '2026-10-31T18:00:00'), now)).toBe(
      'published',
    );
    expect(
      viewStatus(windowEntry('2026-10-31T13:00:00', '2026-10-31T14:00:00', { state: 'full' }), now),
    ).toBe('published');
    expect(
      viewStatus(
        windowEntry('2026-10-31T09:00:00', '2026-10-31T11:00:00', { state: 'closed' }),
        now,
      ),
    ).toBe('closed');
  });

  it('매물과 시간대를 시작 순서로 섞고, 같은 시각이면 시간대가 먼저 온다', () => {
    const merged = mergeEntries(
      [
        slot('2026-10-31T15:00:00'),
        slot('2026-10-31T13:00:00', { windowId: 'window-2026-10-31T13:00:00' }),
      ],
      [
        windowEntry('2026-10-31T13:00:00', '2026-10-31T18:00:00'),
        windowEntry('2026-10-31T09:00:00', '2026-10-31T11:00:00', { state: 'closed' }),
      ],
    );
    expect(merged.map((entry) => `${entry.kind} ${entry.id}`)).toEqual([
      'window window-2026-10-31T09:00:00',
      'window window-2026-10-31T13:00:00',
      'slot 2026-10-31T13:00:00',
      'slot 2026-10-31T15:00:00',
    ]);
  });

  it('탭 나누기·상태별 개수·[전체] 구역에 시간대도 한 줄로 들어간다', () => {
    const entries = mergeEntries(
      [slot('2026-10-31T15:00:00', { status: 'reserved' })],
      [
        windowEntry('2026-10-31T13:00:00', '2026-10-31T18:00:00', { state: 'full' }),
        windowEntry('2026-11-02T10:00:00', '2026-11-02T12:00:00', { state: 'scheduled' }),
      ],
    );
    const byDay = splitByDay(entries, now);
    expect([byDay.today.length, byDay.upcoming.length]).toEqual([2, 1]);
    expect(countByStatus(entries, now)).toEqual({
      scheduled: 1,
      published: 1,
      reserved: 1,
      closed: 0,
      cancelled: 0,
      completed: 0,
    });
    expect(
      allTabSections(byDay, 'published', now).map((section) => [
        section.day,
        section.shown.map((entry) => entry.kind),
      ]),
    ).toEqual([
      ['today', ['window']],
      ['upcoming', []],
    ]);
  });
});
