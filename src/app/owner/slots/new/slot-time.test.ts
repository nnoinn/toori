import { describe, expect, it } from 'vitest';

import { PUBLISH_WINDOW_HOURS, SLOT_START_STEP_MINUTES } from '@/server/policy';

import {
  checkBusinessHours,
  checkStart,
  groupByKstDate,
  isOnStep,
  kstDateKey,
  latestStart,
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

  it('48시간 정각까지 받고, 넘으면 막는다', () => {
    const exact = at('2026-11-02T09:00:00');
    expect(checkStart(exact, at('2026-10-31T09:00:00'))).toBeNull();
    expect(checkStart(exact, at('2026-10-31T08:59:59'))).toBe('TOO_FAR');
  });

  it('단위에 맞지 않으면 막는다', () => {
    expect(checkStart(at('2026-10-31T12:05:00'), now)).toBe('NOT_ON_STEP');
  });

  it('지금 이후 48시간 안의 단위 시각은 받는다', () => {
    expect(checkStart(at('2026-11-01T14:00:00'), now)).toBeNull();
  });
});

describe('startCandidates', () => {
  it('지금 다음 단위 시각부터 48시간까지 단위마다 하나씩', () => {
    const now = at('2026-10-31T09:03:20');
    const starts = startCandidates(now);
    expect(starts[0]).toEqual(at(`2026-10-31T09:${String(step).padStart(2, '0')}:00`));
    expect(starts.at(-1)!.getTime()).toBeLessThanOrEqual(latestStart(now).getTime());
    expect(starts.every((start) => checkStart(start, now) === null)).toBe(true);
    expect(starts).toHaveLength(Math.floor((PUBLISH_WINDOW_HOURS * 60 - (step - 3)) / step) + 1);
  });

  it('지금이 단위 시각 정각이면 그 시각은 빼고 다음 단위부터', () => {
    const now = at('2026-10-31T09:00:00');
    const starts = startCandidates(now);
    expect(starts[0]).toEqual(at(`2026-10-31T09:${String(step).padStart(2, '0')}:00`));
    // 48시간 뒤 정각은 포함한다
    expect(starts.at(-1)).toEqual(at('2026-11-02T09:00:00'));
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

  it('자정을 넘기면 막는다', () => {
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
    expect(kstDateKey(at('2026-11-01T08:30:00'))).toBe('2026-11-01');
  });
});
