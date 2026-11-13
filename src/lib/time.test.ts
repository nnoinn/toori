import { describe, expect, it } from 'vitest';

import {
  addHours,
  addMinutes,
  formatHourLabel,
  formatEndTime,
  formatKst,
  formatKstDateTime,
  formatKstTime,
  hoursUntil,
  kstToUtc,
  minutesUntil,
  utcToKst,
  kstDateKey,
  NEXT_DAY_MARK,
  withNextDayMark,
} from './time';

describe('kstToUtc', () => {
  it('한국 시간 오후 3시는 UTC 오전 6시다', () => {
    const utc = kstToUtc({ year: 2026, month: 10, day: 12, hour: 15, minute: 0 });
    expect(utc.toISOString()).toBe('2026-10-12T06:00:00.000Z');
  });

  it('한국 시간 아침 8시는 UTC로 전날 밤 11시다(날짜가 바뀐다)', () => {
    const utc = kstToUtc({ year: 2026, month: 10, day: 12, hour: 8, minute: 30 });
    expect(utc.toISOString()).toBe('2026-10-11T23:30:00.000Z');
  });
});

describe('utcToKst', () => {
  it('UTC 밤 3시 반은 한국 시간 다음 날 0시 반이다', () => {
    const kst = utcToKst(new Date('2026-10-11T15:30:00.000Z'));
    expect(kst).toEqual({ year: 2026, month: 10, day: 12, hour: 0, minute: 30, weekday: 1 });
  });

  it('kstToUtc와 서로 되돌릴 수 있다', () => {
    const original = { year: 2026, month: 12, day: 31, hour: 23, minute: 50 };
    const { weekday, ...back } = utcToKst(kstToUtc(original));
    expect(back).toEqual(original);
    expect(weekday).toBe(4);
  });
});

describe('kstDateKey', () => {
  it('한국 날짜로 바꾼다(UTC 15시 = 한국 다음 날 0시)', () => {
    expect(kstDateKey(new Date('2026-10-30T14:59:00Z'))).toBe('2026-10-30');
    expect(kstDateKey(new Date('2026-10-30T15:00:00Z'))).toBe('2026-10-31');
  });
});

describe('formatKst', () => {
  it('"월/일(요일) 시:분" 형식으로 보여준다', () => {
    expect(formatKst(new Date('2026-10-12T06:00:00.000Z'))).toBe('10/12(월) 15:00');
    expect(formatKst(new Date('2026-10-11T23:05:00.000Z'))).toBe('10/12(월) 08:05');
  });

  it('formatKstTime: 한국 시각만 "HH:MM"', () => {
    expect(formatKstTime(new Date('2026-10-12T06:00:00.000Z'))).toBe('15:00');
    expect(formatKstTime(new Date('2026-10-11T23:05:00.000Z'))).toBe('08:05');
    // 한국 자정
    expect(formatKstTime(new Date('2026-10-11T15:00:00.000Z'))).toBe('00:00');
  });
});

describe('남은 시간 계산', () => {
  const now = new Date('2026-10-12T00:00:00.000Z');

  it('시간·분 단위로 남은 시간을 계산한다', () => {
    const target = addHours(now, 6);
    expect(hoursUntil(target, now)).toBe(6);
    expect(minutesUntil(addMinutes(now, 10), now)).toBe(10);
  });

  it('이미 지났으면 음수다', () => {
    expect(hoursUntil(addHours(now, -2), now)).toBe(-2);
  });
});

describe('formatHourLabel', () => {
  it('하루 중 시각을 문구로', () => {
    expect(formatHourLabel(13)).toBe('오후 1시');
    expect(formatHourLabel(21)).toBe('밤 9시');
    expect(formatHourLabel(8)).toBe('아침 8시');
    expect(formatHourLabel(12)).toBe('오후 12시');
    expect(formatHourLabel(0)).toBe('밤 12시');
  });
});

describe('끝나는 시각과 운영자 기록 시각 (11/13 nnoinn)', () => {
  it('같은 날 끝나면 시각만, 다음 날 끝나면 "(익일)"을 붙인다("24:00"·"다음 날"은 쓰지 않는다)', () => {
    // 한국 시간 11/14 15:00 ~ 16:00
    expect(formatEndTime(new Date('2026-11-14T06:00:00Z'), new Date('2026-11-14T07:00:00Z'))).toBe(
      '16:00',
    );
    // 한국 시간 11/14 23:00 ~ 11/15 00:00(자정에 끝남)
    expect(formatEndTime(new Date('2026-11-14T14:00:00Z'), new Date('2026-11-14T15:00:00Z'))).toBe(
      '00:00(익일)',
    );
    // 한국 시간 11/14 23:30 ~ 11/15 01:00
    expect(formatEndTime('2026-11-14T14:30:00Z', '2026-11-14T16:00:00Z')).toBe('01:00(익일)');
  });

  it('날짜는 UTC가 아니라 한국 날짜로 본다', () => {
    // UTC로는 11/14 14:00 ~ 14:59(같은 날)이지만, 한국 시간으로도 11/14 23:00 ~ 23:59라 같은 날
    expect(formatEndTime('2026-11-14T14:00:00Z', '2026-11-14T14:59:00Z')).toBe('23:59');
    // UTC로는 11/14 13:00 ~ 11/14 15:30(같은 날)이지만, 한국 시간으로는 22:00 ~ 다음 날 00:30
    expect(formatEndTime('2026-11-14T13:00:00Z', '2026-11-14T15:30:00Z')).toBe('00:30(익일)');
  });

  it('(익일) 표시는 한 곳에서 붙인다', () => {
    expect(NEXT_DAY_MARK).toBe('(익일)');
    expect(withNextDayMark('02:00')).toBe('02:00(익일)');
  });

  it('운영자 기록 시각은 연도를 넣고 요일을 뺀 "YYYY-MM-DD HH:mm"(한국 시간)', () => {
    expect(formatKstDateTime(new Date('2026-11-02T09:22:00Z'))).toBe('2026-11-02 18:22');
    expect(formatKstDateTime('2026-11-02T09:22:00Z')).toBe('2026-11-02 18:22');
    // 해가 바뀌는 때: UTC 12/31 15:30은 한국 시간 다음 해 1/1 00:30
    expect(formatKstDateTime('2026-12-31T15:30:00Z')).toBe('2027-01-01 00:30');
  });
});
