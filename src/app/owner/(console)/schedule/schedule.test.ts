import { describe, expect, it } from 'vitest';

import type { BusinessHours } from '@/db/schema/shops';

import {
  assignLanes,
  DEFAULT_MINUTE_RANGE,
  minutesFromDayStart,
  periodLabel,
  type Placed,
  placeByDay,
  resolveScheduleQuery,
  scheduleDays,
  scheduleHref,
  shiftSchedule,
  slotHref,
  verticalRange,
} from './schedule';

// 예약 현황 캘린더 계산(S-402). 기댓값은 #23 11/15 정민석 계획:
// 주는 일~토, 지난 날짜는 제한 없이, 앞으로는 매물을 올릴 수 있는 14일 뒤(S-205)가 든 주·날까지,
// 칸은 시작한 날 열에(자정을 넘으면 1440분 뒤까지), 겹치면 나란히, 세로 범위는 영업시간과 칸을 1시간 단위로 덮는다

// 2026-11-15는 일요일, 14일 뒤 마지막 날은 2026-11-29(일)
const TODAY = '2026-11-15';

describe('resolveScheduleQuery', () => {
  it('주소에 값이 없거나 이상하면 이번 주 보기', () => {
    expect(resolveScheduleQuery({}, TODAY)).toEqual({ view: 'week', dateKey: TODAY });
    expect(resolveScheduleQuery({ view: 'month', date: '11/20' }, TODAY)).toEqual({
      view: 'week',
      dateKey: TODAY,
    });
    // 없는 날짜
    expect(resolveScheduleQuery({ date: '2026-02-30' }, TODAY).dateKey).toBe(TODAY);
  });

  it('지난 날짜는 제한 없이 보고, 마지막 날보다 뒤면 마지막 날로 맞춘다', () => {
    expect(resolveScheduleQuery({ view: 'day', date: '2025-01-03' }, TODAY)).toEqual({
      view: 'day',
      dateKey: '2025-01-03',
    });
    expect(resolveScheduleQuery({ date: '2026-11-29' }, TODAY).dateKey).toBe('2026-11-29');
    expect(resolveScheduleQuery({ date: '2026-11-30' }, TODAY).dateKey).toBe('2026-11-29');
  });
});

describe('scheduleDays', () => {
  it('주 보기는 그 날이 든 주의 일요일부터 토요일까지(달이 바뀌어도)', () => {
    expect(scheduleDays({ view: 'week', dateKey: '2026-12-02' })).toEqual([
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
      '2026-12-04',
      '2026-12-05',
    ]);
    expect(scheduleDays({ view: 'week', dateKey: TODAY })[0]).toBe(TODAY);
  });

  it('일 보기는 그 날 하나', () => {
    expect(scheduleDays({ view: 'day', dateKey: '2026-11-18' })).toEqual(['2026-11-18']);
  });
});

describe('shiftSchedule', () => {
  it('주 보기는 7일, 일 보기는 하루씩 옮기고, 지난 쪽은 끝이 없다', () => {
    expect(shiftSchedule({ view: 'week', dateKey: TODAY }, -1, TODAY)).toEqual({
      view: 'week',
      dateKey: '2026-11-08',
    });
    expect(shiftSchedule({ view: 'day', dateKey: '2024-01-01' }, -1, TODAY)).toEqual({
      view: 'day',
      dateKey: '2023-12-31',
    });
    expect(shiftSchedule({ view: 'week', dateKey: TODAY }, 1, TODAY)).toEqual({
      view: 'week',
      dateKey: '2026-11-22',
    });
  });

  it('마지막 날이 든 주·날 다음으로는 가지 못한다', () => {
    // 11/22 주 → 11/29 주(마지막 날 11/29가 든 주)는 된다
    expect(shiftSchedule({ view: 'week', dateKey: '2026-11-25' }, 1, TODAY)).toEqual({
      view: 'week',
      dateKey: '2026-11-29',
    });
    expect(shiftSchedule({ view: 'week', dateKey: '2026-11-29' }, 1, TODAY)).toBeNull();
    expect(shiftSchedule({ view: 'day', dateKey: '2026-11-28' }, 1, TODAY)).toEqual({
      view: 'day',
      dateKey: '2026-11-29',
    });
    expect(shiftSchedule({ view: 'day', dateKey: '2026-11-29' }, 1, TODAY)).toBeNull();
  });
});

describe('이름과 주소', () => {
  it('기간 이름은 "11/15(일) ~ 11/21(토)", 해가 다르면 연도를 붙인다', () => {
    expect(periodLabel(scheduleDays({ view: 'week', dateKey: TODAY }))).toBe(
      '11/15(일) ~ 11/21(토)',
    );
    expect(periodLabel(['2026-11-18'])).toBe('11/18(수)');
    expect(periodLabel(scheduleDays({ view: 'week', dateKey: '2026-12-31' }))).toBe(
      '2026/12/27(일) ~ 2027/1/2(토)',
    );
  });

  it('주소는 보기와 날짜를 담는다', () => {
    expect(scheduleHref({ view: 'day', dateKey: '2026-11-18' })).toBe(
      '/owner/schedule?view=day&date=2026-11-18',
    );
  });
});

describe('칸 놓기', () => {
  const block = (startAt: string, endAt: string) => ({ startAt, endAt });

  it('그 날 자정부터 지난 분. 자정을 넘으면 1440보다 크다', () => {
    expect(minutesFromDayStart(TODAY, '2026-11-15T10:30:00+09:00')).toBe(630);
    expect(minutesFromDayStart(TODAY, '2026-11-16T01:00:00+09:00')).toBe(1500);
  });

  it('칸은 시작한 날(한국) 열에 놓고, 보는 날에 시작하지 않은 칸은 뺀다', () => {
    const late = block('2026-11-15T23:00:00+09:00', '2026-11-16T01:00:00+09:00');
    // UTC로는 11/15이지만 한국 날짜로는 11/16
    const nextDay = block('2026-11-16T08:00:00+09:00', '2026-11-16T09:00:00+09:00');
    const placed = placeByDay([late, nextDay], [TODAY]);
    expect([...placed.keys()]).toEqual([TODAY]);
    expect(placed.get(TODAY)).toEqual([{ item: late, top: 1380, bottom: 1500, lane: 0, lanes: 1 }]);
  });

  const at = (top: number, bottom: number): Placed<string> => ({
    item: `${top}-${bottom}`,
    top,
    bottom,
    lane: 0,
    lanes: 1,
  });
  const lanesOf = (placed: Placed<string>[]) =>
    Object.fromEntries(placed.map((p) => [p.item, [p.lane, p.lanes]]));

  it('겹치지 않으면 한 줄, 끝 시각에 바로 이어져도 겹치지 않는다', () => {
    expect(lanesOf(assignLanes([at(60, 120), at(0, 60)]))).toEqual({
      '0-60': [0, 1],
      '60-120': [0, 1],
    });
  });

  it('겹치면 나란히 놓고, 이어서 겹치는 묶음은 같은 줄 수로 나눈다', () => {
    expect(lanesOf(assignLanes([at(0, 60), at(30, 90), at(60, 120), at(200, 260)]))).toEqual({
      '0-60': [0, 2],
      '30-90': [1, 2],
      // 0~60이 끝난 줄에 들어간다
      '60-120': [0, 2],
      '200-260': [0, 1],
    });
  });

  it('묶음이 끝나는 시각에 바로 시작하는 칸은 새 묶음이라 폭을 다 쓴다', () => {
    expect(lanesOf(assignLanes([at(0, 60), at(30, 90), at(90, 150)]))).toEqual({
      '0-60': [0, 2],
      '30-90': [1, 2],
      '90-150': [0, 1],
    });
  });

  it('긴 칸이 묶음 끝을 정한다: 안쪽 짧은 칸이 먼저 끝나도 긴 칸과 겹치는 칸은 같은 묶음', () => {
    // 10:00~14:00 안에 11:00~12:00, 그 뒤 13:00~15:00은 10:00~14:00과 겹친다
    expect(lanesOf(assignLanes([at(600, 840), at(660, 720), at(780, 900)]))).toEqual({
      '600-840': [0, 2],
      '660-720': [1, 2],
      '780-900': [1, 2],
    });
  });

  it('같은 시각에 시작하면 먼저 끝나는 칸이 왼쪽 줄', () => {
    expect(lanesOf(assignLanes([at(0, 120), at(0, 60)]))).toEqual({
      '0-60': [0, 2],
      '0-120': [1, 2],
    });
  });

  it('보는 날 열에 놓은 칸도 겹치면 나란히 놓는다', () => {
    const first = block('2026-11-15T10:00:00+09:00', '2026-11-15T11:00:00+09:00');
    const second = block('2026-11-15T10:30:00+09:00', '2026-11-15T11:30:00+09:00');
    const placed = placeByDay([first, second], [TODAY]).get(TODAY) ?? [];
    expect(placed.map(({ top, lane, lanes }) => [top, lane, lanes])).toEqual([
      [600, 0, 2],
      [630, 1, 2],
    ]);
  });
});

describe('verticalRange', () => {
  // 일 10:00~20:00, 월 쉬는 날, 화 18:00~02:00(새벽까지)
  const HOURS: BusinessHours = [
    { weekday: 0, open: '10:00', close: '20:00' },
    { weekday: 1, closed: true },
    { weekday: 2, open: '18:00', close: '02:00' },
  ];

  it('영업시간도 칸도 없으면 09:00~21:00', () => {
    expect(verticalRange(['2026-11-16'], HOURS, [])).toEqual(DEFAULT_MINUTE_RANGE);
    expect(verticalRange([TODAY], [], [])).toEqual(DEFAULT_MINUTE_RANGE);
    // 09:00 = 540분, 21:00 = 1260분
    expect(DEFAULT_MINUTE_RANGE).toEqual({ start: 540, end: 1260 });
  });

  it('보는 날들의 영업시간을 덮고, 새벽까지 여는 날은 다음 날 새벽까지', () => {
    expect(verticalRange([TODAY], HOURS, [])).toEqual({ start: 600, end: 1200 });
    expect(verticalRange([TODAY, '2026-11-16', '2026-11-17'], HOURS, [])).toEqual({
      start: 600,
      end: 1560,
    });
  });

  it('영업시간 밖의 칸도 덮도록 1시간 단위로 넓힌다', () => {
    expect(verticalRange([TODAY], HOURS, [{ top: 510, bottom: 570 }])).toEqual({
      start: 480,
      end: 1200,
    });
    expect(verticalRange(['2026-11-16'], HOURS, [{ top: 1410, bottom: 1470 }])).toEqual({
      start: 1380,
      end: 1500,
    });
  });
});

describe('slotHref', () => {
  const reservation = {
    id: 'r1',
    code: '123456789012',
    customerName: '김투리',
    view: 'upcoming' as const,
  };

  it('예약이 있으면 예약 상세(지난 예약·취소된 예약도)', () => {
    expect(slotHref({ id: 's1', editable: false, reservation })).toBe('/owner/reservations/r1');
    expect(
      slotHref({ id: 's1', editable: false, reservation: { ...reservation, view: 'cancelled' } }),
    ).toBe('/owner/reservations/r1');
  });

  it('예약이 없으면 지금 고칠 수 있는 매물만 매물 수정, 그 밖에는 누를 수 없다', () => {
    expect(slotHref({ id: 's1', editable: true, reservation: null })).toBe('/owner/slots/s1/edit');
    expect(slotHref({ id: 's1', editable: false, reservation: null })).toBeNull();
  });
});
