import { describe, expect, it } from 'vitest';

import { fromTimeParts, minuteOptions, toTimeParts } from './time-select';

describe('toTimeParts', () => {
  it('24시간 값을 오전·오후 12시간으로', () => {
    expect(toTimeParts('09:30')).toEqual({ period: 'am', hour12: 9, minute: '30' });
    expect(toTimeParts('21:00')).toEqual({ period: 'pm', hour12: 9, minute: '00' });
  });

  it('0시는 오전 12시, 12시는 오후 12시', () => {
    expect(toTimeParts('00:00')).toEqual({ period: 'am', hour12: 12, minute: '00' });
    expect(toTimeParts('12:30')).toEqual({ period: 'pm', hour12: 12, minute: '30' });
  });

  it('빈 값이나 모양이 틀린 값은 null', () => {
    expect(toTimeParts('')).toBeNull();
    expect(toTimeParts('24:00')).toBeNull();
    expect(toTimeParts('9:30')).toBeNull();
  });
});

describe('fromTimeParts', () => {
  it('오전·오후 12시간을 24시간 값으로', () => {
    expect(fromTimeParts('am', 9, '30')).toBe('09:30');
    expect(fromTimeParts('pm', 9, '00')).toBe('21:00');
  });

  it('오전 12시는 00시, 오후 12시는 12시', () => {
    expect(fromTimeParts('am', 12, '00')).toBe('00:00');
    expect(fromTimeParts('pm', 12, '30')).toBe('12:30');
  });

  it('toTimeParts와 서로 되돌아간다', () => {
    for (const value of ['00:00', '06:30', '11:59', '12:00', '13:15', '23:30']) {
      const parts = toTimeParts(value)!;
      expect(fromTimeParts(parts.period, parts.hour12, parts.minute)).toBe(value);
    }
  });
});

describe('minuteOptions', () => {
  it('단위마다 하나씩', () => {
    expect(minuteOptions(30)).toEqual(['00', '30']);
    expect(minuteOptions(15)).toEqual(['00', '15', '30', '45']);
  });

  it('단위에 맞지 않는 지금 값은 지우지 않고 넣는다', () => {
    expect(minuteOptions(30, '15')).toEqual(['00', '15', '30']);
    expect(minuteOptions(30, '30')).toEqual(['00', '30']);
  });
});
