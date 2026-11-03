import { describe, expect, it } from 'vitest';

import { formatClock, formatDuration, formatRemaining, formatWon } from './format';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatWon', () => {
  it('천 단위 쉼표와 원을 붙인다', () => {
    expect(formatWon(28000)).toBe('28,000원');
    expect(formatWon(0)).toBe('0원');
    expect(formatWon(1234567)).toBe('1,234,567원');
  });
});

describe('formatDuration', () => {
  it.each([
    [40, '40분'],
    [60, '1시간'],
    [90, '1시간 30분'],
    [480, '8시간'],
  ])('%i분 → %s', (minutes, text) => {
    expect(formatDuration(minutes)).toBe(text);
  });

  it('0 이하이거나 숫자가 아니면 빈 문자열', () => {
    expect(formatDuration(0)).toBe('');
    expect(formatDuration(-30)).toBe('');
    expect(formatDuration(Number.NaN)).toBe('');
  });
});

describe('formatRemaining', () => {
  it('지났으면 0분, 1분이 안 남았으면 1분 미만', () => {
    expect(formatRemaining(-1)).toBe('0분');
    expect(formatRemaining(0)).toBe('0분');
    expect(formatRemaining(30 * 1000)).toBe('1분 미만');
  });

  it('분·시간·일 단위로 짧게 보여준다', () => {
    expect(formatRemaining(12 * MIN)).toBe('12분');
    expect(formatRemaining(5 * HOUR + 12 * MIN + 30 * 1000)).toBe('5시간 12분');
    expect(formatRemaining(6 * HOUR)).toBe('6시간');
    expect(formatRemaining(DAY + 3 * HOUR + 59 * MIN)).toBe('1일 3시간');
    expect(formatRemaining(2 * DAY)).toBe('2일');
  });
});

describe('formatClock', () => {
  it('분:초로 보여준다', () => {
    expect(formatClock(10 * MIN)).toBe('10:00');
    expect(formatClock(9 * MIN + 41 * 1000 + 999)).toBe('09:41');
    expect(formatClock(-5000)).toBe('00:00');
  });

  it('1시간 이상이면 시:분:초', () => {
    expect(formatClock(HOUR + 2 * MIN + 3 * 1000)).toBe('1:02:03');
  });
});
