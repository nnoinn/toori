import { describe, expect, it } from 'vitest';

import {
  addHours,
  addMinutes,
  formatKst,
  hoursUntil,
  kstToUtc,
  minutesUntil,
  utcToKst,
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

describe('formatKst', () => {
  it('"월/일(요일) 시:분" 형식으로 보여준다', () => {
    expect(formatKst(new Date('2026-10-12T06:00:00.000Z'))).toBe('10/12(월) 15:00');
    expect(formatKst(new Date('2026-10-11T23:05:00.000Z'))).toBe('10/12(월) 08:05');
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
