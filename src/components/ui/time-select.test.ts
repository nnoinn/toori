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
  it('닫는 시각 칸의 00:00만 "00:00(자정)"', () => {
    expect(timeOptionLabel('00:00', true)).toBe('00:00(자정)');
    expect(timeOptionLabel('00:00')).toBe('00:00');
    expect(timeOptionLabel('02:00', true)).toBe('02:00');
  });
});
