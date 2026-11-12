import { describe, expect, it } from 'vitest';

import { timeOptionLabel, timeOptions } from './time-select';

describe('timeOptions', () => {
  it('00:00부터 단위마다 하루치(24시간 표기)', () => {
    const options = timeOptions(30);
    expect(options).toHaveLength(48);
    expect(options.slice(0, 3)).toEqual(['00:00', '00:30', '01:00']);
    expect(options.at(-1)).toBe('23:30');
    expect(timeOptions(60)).toHaveLength(24);
  });

  it('단위에 맞지 않는 지금 값은 지우지 않고 시각 순서대로 넣는다', () => {
    const options = timeOptions(30, '10:15');
    expect(options).toHaveLength(49);
    expect(options.slice(20, 23)).toEqual(['10:00', '10:15', '10:30']);
    expect(timeOptions(30, '10:30')).toHaveLength(48);
  });

  it('빈 값이나 모양이 틀린 값은 넣지 않는다', () => {
    expect(timeOptions(30, '')).toHaveLength(48);
    expect(timeOptions(30, '24:00')).toHaveLength(48);
  });
});

describe('timeOptionLabel', () => {
  it('여는 시각을 주면 그보다 이르거나 같은 닫는 시각에 "(익일)"을 붙인다(18:00 ~ 02:00, 24시간 영업)', () => {
    expect(timeOptionLabel('02:00', true, '18:00')).toBe('02:00(익일)');
    expect(timeOptionLabel('00:00', true, '18:00')).toBe('00:00(익일)');
    expect(timeOptionLabel('18:00', true, '18:00')).toBe('18:00(익일)');
    expect(timeOptionLabel('18:30', true, '18:00')).toBe('18:30');
    expect(timeOptionLabel('23:30', true, '09:00')).toBe('23:30');
  });

  it('여는 시각이 없거나 모양이 틀리면 닫는 시각 00:00에만 붙인다', () => {
    expect(timeOptionLabel('00:00', true)).toBe('00:00(익일)');
    expect(timeOptionLabel('02:00', true)).toBe('02:00');
    expect(timeOptionLabel('02:00', true, '')).toBe('02:00');
    expect(timeOptionLabel('02:00', true, '24:00')).toBe('02:00');
  });

  it('여는 시각 칸에는 붙이지 않는다', () => {
    expect(timeOptionLabel('00:00')).toBe('00:00');
    expect(timeOptionLabel('02:00', false, '18:00')).toBe('02:00');
  });
});
