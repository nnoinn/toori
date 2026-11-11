import { describe, expect, it } from 'vitest';

import {
  ADVANCE_LISTING_DAYS,
  PUBLISH_WINDOW_HOURS,
  SLOT_START_STEP_MINUTES,
} from '@/server/policy';

import {
  checkBusinessHours,
  checkStart,
  groupByKstDate,
  isClosedDay,
  isOnStep,
  latestStart,
  openSpans,
  publishPlan,
  rangesOverlap,
  slotEnd,
  startCandidates,
} from './slot-time';

const at = (iso: string) => new Date(`${iso}+09:00`);
const step = SLOT_START_STEP_MINUTES;

describe('slotEnd', () => {
  it('시작 + 소요 시간', () => {
    expect(slotEnd(at('2026-11-01T14:00:00'), 90)).toEqual(at('2026-11-01T15:30:00'));
  });
});

describe('rangesOverlap', () => {
  const ten = { start: at('2026-11-01T10:00:00'), end: at('2026-11-01T11:00:00') };

  it('끝 시각에 바로 이어지면 겹치지 않는다', () => {
    expect(
      rangesOverlap(ten, { start: at('2026-11-01T11:00:00'), end: at('2026-11-01T12:00:00') }),
    ).toBe(false);
    expect(
      rangesOverlap(ten, { start: at('2026-11-01T09:00:00'), end: at('2026-11-01T10:00:00') }),
    ).toBe(false);
  });

  it('조금이라도 겹치면 겹친다', () => {
    expect(
      rangesOverlap(ten, { start: at('2026-11-01T10:50:00'), end: at('2026-11-01T11:50:00') }),
    ).toBe(true);
    expect(
      rangesOverlap(ten, { start: at('2026-11-01T09:00:00'), end: at('2026-11-01T12:00:00') }),
    ).toBe(true);
  });
});

describe('isOnStep', () => {
  it('한국 시간 분이 단위에 맞고 초가 0이어야 한다', () => {
    expect(isOnStep(at('2026-11-01T14:00:00'))).toBe(true);
    expect(isOnStep(at(`2026-11-01T14:${String(step).padStart(2, '0')}:00`))).toBe(true);
    expect(isOnStep(at('2026-11-01T14:05:00'))).toBe(false);
    expect(isOnStep(at('2026-11-01T14:00:30'))).toBe(false);
  });
});

describe('checkStart', () => {
  const now = at('2026-10-31T09:03:00');

  it('지금과 같거나 지난 시각은 막는다', () => {
    expect(checkStart(at('2026-10-31T09:00:00'), now)).toBe('PAST');
    expect(checkStart(at('2026-10-31T09:00:00'), at('2026-10-31T09:00:00'))).toBe('PAST');
  });

  it('14일 정각까지 받고, 넘으면 막는다(S-205)', () => {
    const exact = at('2026-11-14T09:00:00');
    expect(checkStart(exact, at('2026-10-31T09:00:00'))).toBeNull();
    expect(checkStart(exact, at('2026-10-31T08:59:59'))).toBe('TOO_FAR');
  });

  it('게시중 매물을 고칠 때는 48시간 정각까지만 받는다(11/9)', () => {
    const exact = at('2026-11-02T09:00:00');
    expect(checkStart(exact, at('2026-10-31T09:00:00'), 'published')).toBeNull();
    expect(checkStart(exact, at('2026-10-31T08:59:59'), 'published')).toBe('TOO_FAR_PUBLISHED');
    // 같은 시각도 새로 올릴 때는 받는다
    expect(checkStart(exact, at('2026-10-31T08:59:59'))).toBeNull();
  });

  it('단위에 맞지 않으면 막는다', () => {
    expect(checkStart(at('2026-10-31T12:05:00'), now)).toBe('NOT_ON_STEP');
  });

  it('지금 이후 14일 안의 단위 시각은 받는다', () => {
    expect(checkStart(at('2026-11-01T14:00:00'), now)).toBeNull();
  });
});

describe('startCandidates', () => {
  it('지금 다음 단위 시각부터 14일까지 단위마다 하나씩', () => {
    const now = at('2026-10-31T09:03:20');
    const starts = startCandidates(now);
    expect(starts[0]).toEqual(at(`2026-10-31T09:${String(step).padStart(2, '0')}:00`));
    expect(starts.at(-1)!.getTime()).toBeLessThanOrEqual(latestStart(now).getTime());
    expect(starts.every((start) => checkStart(start, now) === null)).toBe(true);
    expect(starts).toHaveLength(
      Math.floor((ADVANCE_LISTING_DAYS * 24 * 60 - (step - 3)) / step) + 1,
    );
  });

  it('게시중 매물을 고칠 때는 48시간까지', () => {
    const now = at('2026-10-31T09:03:20');
    const starts = startCandidates(now, 'published');
    expect(starts.every((start) => checkStart(start, now, 'published') === null)).toBe(true);
    expect(starts).toHaveLength(Math.floor((PUBLISH_WINDOW_HOURS * 60 - (step - 3)) / step) + 1);
  });

  it('지금이 단위 시각 정각이면 그 시각은 빼고 다음 단위부터', () => {
    const now = at('2026-10-31T09:00:00');
    const starts = startCandidates(now);
    expect(starts[0]).toEqual(at(`2026-10-31T09:${String(step).padStart(2, '0')}:00`));
    // 14일 뒤 정각은 포함한다
    expect(starts.at(-1)).toEqual(at('2026-11-14T09:00:00'));
  });
});

describe('publishPlan (S-204·S-205)', () => {
  const now = at('2026-10-31T09:00:00');

  it('시작 48시간 전이 아직 오지 않았으면 그 시각에 게시하는 예약대기', () => {
    expect(publishPlan(at('2026-11-05T14:00:00'), now)).toEqual({
      status: 'scheduled',
      publishAt: at('2026-11-03T14:00:00'),
    });
    // 48시간 30분 남았으면 30분 뒤 게시
    expect(publishPlan(at('2026-11-02T09:30:00'), now)).toEqual({
      status: 'scheduled',
      publishAt: at('2026-10-31T09:30:00'),
    });
  });

  it('딱 48시간 남았거나 그보다 가까우면 지금 게시중', () => {
    expect(publishPlan(at('2026-11-02T09:00:00'), now)).toEqual({
      status: 'published',
      publishAt: now,
    });
    expect(publishPlan(at('2026-10-31T15:00:00'), now)).toEqual({
      status: 'published',
      publishAt: now,
    });
  });
});

describe('checkBusinessHours', () => {
  // 2026-11-01은 일요일, 11-02는 월요일
  const hours = [
    { weekday: 0, closed: true as const },
    { weekday: 1, open: '10:00', close: '20:00' },
    { weekday: 2, open: '10:00', close: '24:00' },
  ];
  const range = (start: string, end: string) => ({ start: at(start), end: at(end) });

  it('쉬는 날은 막는다', () => {
    expect(checkBusinessHours(range('2026-11-01T12:00:00', '2026-11-01T13:00:00'), hours)).toBe(
      'CLOSED_DAY',
    );
  });

  it('여는 시각부터 시작해 닫는 시각에 끝나면 괜찮다', () => {
    expect(
      checkBusinessHours(range('2026-11-02T10:00:00', '2026-11-02T11:00:00'), hours),
    ).toBeNull();
    expect(
      checkBusinessHours(range('2026-11-02T19:00:00', '2026-11-02T20:00:00'), hours),
    ).toBeNull();
  });

  it('여는 시각 전에 시작하거나 닫는 시각 뒤에 끝나면 막는다', () => {
    expect(checkBusinessHours(range('2026-11-02T09:50:00', '2026-11-02T10:50:00'), hours)).toBe(
      'OUTSIDE_HOURS',
    );
    expect(checkBusinessHours(range('2026-11-02T19:10:00', '2026-11-02T20:10:00'), hours)).toBe(
      'OUTSIDE_HOURS',
    );
  });

  it('자정 마감 영업에서 자정을 넘기면 막는다(다음 날 영업을 입력하지 않음)', () => {
    expect(checkBusinessHours(range('2026-11-03T23:30:00', '2026-11-04T00:30:00'), hours)).toBe(
      'OUTSIDE_HOURS',
    );
  });

  it('영업시간을 입력하지 않은 요일은 막지 않는다', () => {
    expect(
      checkBusinessHours(range('2026-11-05T03:00:00', '2026-11-05T04:00:00'), hours),
    ).toBeNull();
    expect(checkBusinessHours(range('2026-11-02T03:00:00', '2026-11-02T04:00:00'), [])).toBeNull();
  });
});

describe('새벽까지 영업 (11/11 nnoinn)', () => {
  // 2026-11-02 월, 03 화, 04 수, 05 목, 06 금, 07 토, 08 일
  const night = [
    { weekday: 6, open: '20:00', close: '03:00' }, // 토 20:00 ~ 일 03:00
    { weekday: 0, closed: true as const }, // 일 쉬는 날
    { weekday: 1, open: '18:00', close: '02:00' }, // 월 18:00 ~ 화 02:00
    { weekday: 2, open: '10:00', close: '00:00' }, // 화 10:00 ~ 자정
    { weekday: 3, open: '09:00', close: '09:00' }, // 수 24시간(목 09:00까지)
    { weekday: 4, closed: true as const }, // 목 쉬는 날
  ];
  const range = (start: string, end: string) => ({ start: at(start), end: at(end) });
  const check = (start: string, end: string) => checkBusinessHours(range(start, end), night);

  it('영업 구간: 그 날 영업과 전날에서 이어진 새벽(그 날 자정부터 지난 분)', () => {
    expect(openSpans('2026-11-02', night)).toEqual([{ start: 1080, end: 1560 }]);
    expect(openSpans('2026-11-03', night)).toEqual([
      { start: 0, end: 120 },
      { start: 600, end: 1440 },
    ]);
    // 전날이 자정 마감이면 이어지는 새벽이 없다. 같은 시각은 24시간
    expect(openSpans('2026-11-04', night)).toEqual([{ start: 540, end: 1980 }]);
    // 쉬는 날은 전날에서 이어진 새벽만
    expect(openSpans('2026-11-05', night)).toEqual([{ start: 0, end: 540 }]);
    expect(openSpans('2026-11-08', night)).toEqual([{ start: 0, end: 180 }]);
    expect(openSpans('2026-11-08', [{ weekday: 0, closed: true }])).toEqual([]);
    // 입력하지 않은 요일은 막지 않는다
    expect(openSpans('2026-11-06', night)).toBeNull();
  });

  it('다음 날 새벽까지: 영업 중인 한 구간 안에서 끝나면 된다', () => {
    expect(check('2026-11-02T23:30:00', '2026-11-03T00:30:00')).toBeNull();
    expect(check('2026-11-02T18:00:00', '2026-11-03T02:00:00')).toBeNull();
    expect(check('2026-11-02T17:30:00', '2026-11-02T18:30:00')).toBe('OUTSIDE_HOURS');
    expect(check('2026-11-02T23:30:00', '2026-11-03T02:30:00')).toBe('OUTSIDE_HOURS');
  });

  it('매물의 날짜는 시작 날짜: 화요일 새벽은 월요일 영업이 이어진 시간', () => {
    expect(check('2026-11-03T01:00:00', '2026-11-03T02:00:00')).toBeNull();
    expect(check('2026-11-03T01:30:00', '2026-11-03T02:30:00')).toBe('OUTSIDE_HOURS');
    expect(check('2026-11-03T03:00:00', '2026-11-03T04:00:00')).toBe('OUTSIDE_HOURS');
    // 월요일 새벽은 일요일(쉬는 날)에서 이어지지 않는다
    expect(check('2026-11-02T01:00:00', '2026-11-02T02:00:00')).toBe('OUTSIDE_HOURS');
  });

  it('자정 마감: 닫는 시각 00:00은 그 날 밤 12시', () => {
    expect(check('2026-11-03T23:00:00', '2026-11-04T00:00:00')).toBeNull();
    expect(check('2026-11-03T23:30:00', '2026-11-04T00:30:00')).toBe('OUTSIDE_HOURS');
  });

  it('24시간: 여는 시각부터 다음 날 같은 시각까지', () => {
    expect(check('2026-11-04T23:00:00', '2026-11-05T01:00:00')).toBeNull();
    expect(check('2026-11-05T08:00:00', '2026-11-05T09:00:00')).toBeNull();
    expect(check('2026-11-04T08:00:00', '2026-11-04T09:00:00')).toBe('OUTSIDE_HOURS');
  });

  it('쉬는 날 다음 새벽: 전날에서 이어진 시각만 고를 수 있다', () => {
    expect(check('2026-11-08T01:00:00', '2026-11-08T02:00:00')).toBeNull();
    expect(check('2026-11-08T02:30:00', '2026-11-08T03:30:00')).toBe('CLOSED_DAY');
    expect(check('2026-11-05T09:00:00', '2026-11-05T10:00:00')).toBe('CLOSED_DAY');
  });

  it('매일 00:00 ~ 00:00(24시간)이면 자정을 넘겨도 된다', () => {
    const allDay = [
      { weekday: 5, open: '00:00', close: '00:00' },
      { weekday: 6, open: '00:00', close: '00:00' },
    ];
    expect(
      checkBusinessHours(range('2026-11-06T23:30:00', '2026-11-07T00:30:00'), allDay),
    ).toBeNull();
    // 다음 날 영업을 입력하지 않았으면 자정에 끝난다
    expect(
      checkBusinessHours(range('2026-11-06T23:30:00', '2026-11-07T00:30:00'), [allDay[0]]),
    ).toBe('OUTSIDE_HOURS');
  });
});

describe('groupByKstDate', () => {
  it('한국 날짜로 묶는다(자정 기준)', () => {
    const groups = groupByKstDate([
      at('2026-10-31T23:50:00'),
      at('2026-11-01T00:00:00'),
      at('2026-11-01T08:30:00'),
    ]);
    expect(groups.map((group) => [group.dateKey, group.starts.length])).toEqual([
      ['2026-10-31', 1],
      ['2026-11-01', 2],
    ]);
  });
});

describe('isClosedDay', () => {
  // 2026-11-01은 일요일, 11-02는 월요일, 11-03은 화요일
  const hours = [
    { weekday: 0, closed: true as const },
    { weekday: 1, open: '10:00', close: '20:00' },
  ];

  it('쉬는 날로 입력한 요일만 true', () => {
    expect(isClosedDay(at('2026-11-01T12:00:00'), hours)).toBe(true);
    expect(isClosedDay(at('2026-11-02T12:00:00'), hours)).toBe(false);
  });

  it('영업시간을 입력하지 않은 요일과 날짜가 없을 때는 false', () => {
    expect(isClosedDay(at('2026-11-03T12:00:00'), hours)).toBe(false);
    expect(isClosedDay(undefined, hours)).toBe(false);
  });

  it('한국 날짜로 본다(UTC로는 전날이어도 한국 일요일이면 쉬는 날)', () => {
    expect(isClosedDay(at('2026-11-01T08:00:00'), hours)).toBe(true);
  });

  it('쉬는 날이어도 전날 영업이 새벽까지 이어지면 false(그 새벽은 고를 수 있다)', () => {
    const night = [{ weekday: 6, open: '20:00', close: '03:00' }, ...hours];
    expect(isClosedDay(at('2026-11-01T12:00:00'), night)).toBe(false);
  });
});
