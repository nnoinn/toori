import { describe, expect, it } from 'vitest';

import { closingTimeOptions, timeOptionLabel, timeOptions } from './time-select';

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

// 11/16 정민석: 닫는 시각 목록은 그 날 시각 먼저, "(익일)" 시각은 그 아래
describe('closingTimeOptions', () => {
  it('18:00에 열면 18:30 … 23:30, 그 아래 00:00(익일) … 18:00(익일)', () => {
    const options = closingTimeOptions(timeOptions(30), '18:00');
    expect(options).toHaveLength(48);
    expect(options.slice(0, 2)).toEqual(['18:30', '19:00']);
    expect(options.slice(10, 13)).toEqual(['23:30', '00:00', '00:30']);
    // 맨 아래는 여는 시각과 같은 24시간 영업
    expect(options.slice(-2)).toEqual(['17:30', '18:00']);
  });

  it('여는 시각을 모르면 00:00(익일)만 맨 아래로', () => {
    const options = closingTimeOptions(timeOptions(30));
    expect(options.slice(0, 2)).toEqual(['00:30', '01:00']);
    expect(options.slice(-2)).toEqual(['23:30', '00:00']);
  });

  it('단위에 맞지 않는 예전 값도 그 날·다음 날 자리에 시각 순서대로', () => {
    expect(closingTimeOptions(timeOptions(30, '02:15'), '18:00').slice(15, 18)).toEqual([
      '02:00',
      '02:15',
      '02:30',
    ]);
  });
});
