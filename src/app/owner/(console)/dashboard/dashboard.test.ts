import { describe, expect, it } from 'vitest';

import {
  allTabSections,
  countByStatus,
  type DashboardSlot,
  type DashboardWindow,
  keptSlotsNotice,
  dashboardHref,
  mergeEntries,
  onHold,
  rowDetailHref,
  splitByDay,
  toDashboardSort,
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
  createdAt: kst('2026-10-30T00:00:00'),
  menuName: '커트',
  listPrice: 20000,
  salePrice: 14000,
  discountRate: 30,
  newCustomerOnly: false,
  holdCustomerId: null,
  holdExpiresAt: null,
  closeReason: null,
  adminCloseCode: null,
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
  it('시작이 지난 게시중은 마감, 게시 시각 전 게시예정은 게시예정', () => {
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
  createdAt: kst('2026-10-30T00:00:00'),
  state: 'published',
  closeReason: null,
  adminCloseCode: null,
  newCustomerOnly: false,
  menus: [{ menuId: 'm1', name: '커트', listPrice: 20000, discountRate: 30 }],
  keptSlots: [],
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

describe('매물 목록 정렬 (#358 5번, 11/18 정민석)', () => {
  /** 줄 이름: 종류와 id */
  const names = (entries: readonly { kind: string; id: string }[]) =>
    entries.map((entry) => `${entry.kind} ${entry.id}`);

  // 11/1 10시와 10/31 15시 매물은 같은 시각에 등록했다(받은 순서는 늦게 시작하는 매물이 먼저)
  const slots = [
    slot('2026-11-01T10:00:00', { createdAt: kst('2026-10-30T09:00:00') }),
    slot('2026-10-31T13:00:00', {
      windowId: 'window-2026-10-31T13:00:00',
      createdAt: kst('2026-10-31T11:00:00'),
    }),
    slot('2026-10-31T15:00:00', { createdAt: kst('2026-10-30T09:00:00') }),
  ];
  const windows = [
    windowEntry('2026-10-31T13:00:00', '2026-10-31T18:00:00', {
      createdAt: kst('2026-10-29T10:00:00'),
    }),
  ];

  it('시작 시각 늦은 순: 늦게 시작하는 줄부터, 같은 시각이면 시간대가 먼저', () => {
    expect(names(mergeEntries(slots, windows, 'start_desc'))).toEqual([
      'slot 2026-11-01T10:00:00',
      'slot 2026-10-31T15:00:00',
      'window window-2026-10-31T13:00:00',
      'slot 2026-10-31T13:00:00',
    ]);
  });

  it('등록 최신 순: 늦게 등록한 줄부터, 같은 시각에 등록했으면 시작 시각 빠른 순', () => {
    expect(names(mergeEntries(slots, windows, 'created_desc'))).toEqual([
      'slot 2026-10-31T13:00:00',
      'slot 2026-10-31T15:00:00',
      'slot 2026-11-01T10:00:00',
      'window window-2026-10-31T13:00:00',
    ]);
  });

  it('정렬을 주지 않으면 시작 시각 빠른 순(지금까지의 순서)', () => {
    expect(mergeEntries(slots, windows)).toEqual(mergeEntries(slots, windows, 'start_asc'));
    expect(names(mergeEntries(slots, windows))).toEqual([
      'window window-2026-10-31T13:00:00',
      'slot 2026-10-31T13:00:00',
      'slot 2026-10-31T15:00:00',
      'slot 2026-11-01T10:00:00',
    ]);
  });

  it('[전체] 탭은 오늘·예정 구역 안에서 각각 정렬하고, 구역마다 정렬한 순서의 앞 7개를 보여준다', () => {
    // 예정 9개: 11/1 9시부터 1시간마다. 등록한 날은 시작 순서와 섞여 있다(9시 매물 10/20, 10시 매물 10/28 …)
    const createdDays = [20, 28, 21, 27, 22, 26, 23, 25, 24];
    const upcoming = createdDays.map((day, index) =>
      slot(`2026-11-01T${String(9 + index).padStart(2, '0')}:00:00`, {
        createdAt: kst(`2026-10-${day}T09:00:00`),
      }),
    );
    const today = [
      slot('2026-10-31T13:00:00', { createdAt: kst('2026-10-29T09:00:00') }),
      slot('2026-10-31T15:00:00', { createdAt: kst('2026-10-30T09:00:00') }),
    ];
    const sections = allTabSections(
      splitByDay(mergeEntries([...upcoming, ...today], [], 'created_desc'), now),
      'all',
      now,
    );
    expect(sections.map((section) => [section.day, names(section.shown), section.more])).toEqual([
      ['today', ['slot 2026-10-31T15:00:00', 'slot 2026-10-31T13:00:00'], 0],
      [
        'upcoming',
        // 늦게 등록한 매물부터 7개(10/28~10/22 등록), 가장 일찍 등록한 2개(11시 10/21, 9시 10/20)는 [더보기]
        [
          'slot 2026-11-01T10:00:00',
          'slot 2026-11-01T12:00:00',
          'slot 2026-11-01T14:00:00',
          'slot 2026-11-01T16:00:00',
          'slot 2026-11-01T17:00:00',
          'slot 2026-11-01T15:00:00',
          'slot 2026-11-01T13:00:00',
        ],
        2,
      ],
    ]);
  });

  it('주소의 sort: 모르는 값·없으면 시작 시각 빠른 순, 기본 정렬은 주소에 쓰지 않는다', () => {
    expect(toDashboardSort('created_desc')).toBe('created_desc');
    expect(toDashboardSort('start_desc')).toBe('start_desc');
    expect(toDashboardSort('price')).toBe('start_asc');
    expect(toDashboardSort(undefined)).toBe('start_asc');
    expect(dashboardHref('start_asc')).toBe('/owner');
    expect(dashboardHref('created_desc')).toBe('/owner?sort=created_desc');
  });
});

describe('시간대 마감 때 손님이 결제 중이라 남긴 칸 안내 (WINDOW-06)', () => {
  /** 남긴 칸 하나. 시각은 한국 시간 */
  const kept = (start: string, end: string, menuName = '커트') => ({
    startAt: kst(start),
    endAt: kst(end),
    menuName,
  });

  it('남긴 칸이 없으면 안내하지 않는다', () => {
    expect(keptSlotsNotice([])).toBeNull();
  });

  it('11/13 nnoinn 문구: 시작~끝(서비스)과 결제하면 예약으로 남고 결제하지 않으면 자동으로 닫힌다는 안내', () => {
    expect(keptSlotsNotice([kept('2026-11-14T14:00:00', '2026-11-14T15:00:00')])).toBe(
      '손님이 결제 중인 14:00~15:00(커트)은 결제가 끝날 때까지 남아 있어요. 결제하면 예약으로 남고, 결제하지 않으면 자동으로 닫혀요.',
    );
  });

  it('칸이 여러 개면 받은 순서(시작 순)대로 쉼표로 잇고, 다음 날 끝나는 칸은 끝 시각에 (익일)', () => {
    expect(
      keptSlotsNotice([
        kept('2026-11-14T14:00:00', '2026-11-14T15:00:00'),
        kept('2026-11-14T23:30:00', '2026-11-15T00:30:00', '펌'),
      ]),
    ).toBe(
      '손님이 결제 중인 14:00~15:00(커트), 23:30~00:30(익일)(펌)은 결제가 끝날 때까지 남아 있어요. 결제하면 예약으로 남고, 결제하지 않으면 자동으로 닫혀요.',
    );
  });
});

describe('줄을 두 번 누르면 여는 곳 (11/16 정민석)', () => {
  it('예약이 있는 줄(예약됨·완료·취소, 처리 필요)은 그 예약 상세, 없는 줄은 고르기만(null)', () => {
    expect(rowDetailHref(slot('2026-10-31T15:00:00', { reservationId: 'r1' }))).toBe(
      '/owner/reservations/r1',
    );
    expect(rowDetailHref(slot('2026-10-31T15:00:00', { reservationId: null }))).toBeNull();
  });
});
