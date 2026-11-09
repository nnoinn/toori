import { describe, expect, it } from 'vitest';

import { addDaysToKey, calendarWeeks, monthRangeLabel, weekdayOfKey } from './calendar-days';

describe('addDaysToKey·weekdayOfKey', () => {
  it('달·해가 바뀌어도 하루씩 더하고 뺀다', () => {
    expect(addDaysToKey('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToKey('2026-11-01', -1)).toBe('2026-10-31');
  });

  it('요일은 0이 일요일', () => {
    expect(weekdayOfKey('2026-11-08')).toBe(0); // 일
    expect(weekdayOfKey('2026-11-09')).toBe(1); // 월
    expect(weekdayOfKey('2026-11-14')).toBe(6); // 토
  });
});

describe('calendarWeeks', () => {
  it('첫 날이 든 주의 일요일부터 마지막 날이 든 주의 토요일까지 7칸씩', () => {
    // 11/9(월) ~ 11/23(월): 11/8(일) ~ 11/28(토), 3주
    const weeks = calendarWeeks('2026-11-09', '2026-11-23');
    expect(weeks).toHaveLength(3);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0][0]).toBe('2026-11-08');
    expect(weeks[0][1]).toBe('2026-11-09');
    expect(weeks[2][6]).toBe('2026-11-28');
  });

  it('첫 날이 일요일이고 마지막 날이 토요일이면 앞뒤를 더하지 않는다', () => {
    expect(calendarWeeks('2026-11-08', '2026-11-14')).toEqual([
      [
        '2026-11-08',
        '2026-11-09',
        '2026-11-10',
        '2026-11-11',
        '2026-11-12',
        '2026-11-13',
        '2026-11-14',
      ],
    ]);
  });

  it('달이 바뀌는 주도 이어서 놓는다', () => {
    const weeks = calendarWeeks('2026-11-25', '2026-12-09');
    expect(weeks.flat()).toContain('2026-12-01');
    expect(weeks[0][0]).toBe('2026-11-22');
    expect(weeks.at(-1)!.at(-1)).toBe('2026-12-12');
  });
});

describe('monthRangeLabel', () => {
  it('같은 달, 달이 바뀔 때, 해가 바뀔 때', () => {
    expect(monthRangeLabel('2026-11-09', '2026-11-23')).toBe('2026년 11월');
    expect(monthRangeLabel('2026-11-25', '2026-12-09')).toBe('2026년 11월 ~ 12월');
    expect(monthRangeLabel('2026-12-25', '2027-01-08')).toBe('2026년 12월 ~ 2027년 1월');
  });
});
