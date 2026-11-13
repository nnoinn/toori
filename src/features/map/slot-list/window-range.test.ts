import { describe, expect, it } from 'vitest';

import { startEndText, windowRangeText } from './window-range';

// 시각은 UTC로 적는다. 한국 시간은 +9시간(2026-11-14 토요일)
const kst = (day: number, hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 10, day, hour - 9, minute)).toISOString();

describe('시간대 범위', () => {
  it('같은 날이면 날짜 한 번과 시작·끝 시각', () => {
    expect(windowRangeText(kst(14, 14), kst(14, 18))).toBe('11/14(토) 14:00 ~ 18:00');
  });

  it('새벽까지 이어지면 끝에 "다음 날"을 붙인다', () => {
    expect(windowRangeText(kst(14, 22), kst(15, 2))).toBe('11/14(토) 22:00 ~ 다음 날 02:00');
  });

  it('자정에 끝나면 24:00', () => {
    expect(windowRangeText(kst(14, 18), kst(15, 0))).toBe('11/14(토) 18:00 ~ 24:00');
  });

  it('시작 시각 버튼의 끝 시각도 같은 규칙', () => {
    expect(startEndText({ startAt: kst(14, 14), endAt: kst(14, 15, 30) })).toBe('~ 15:30');
    expect(startEndText({ startAt: kst(14, 23), endAt: kst(15, 0) })).toBe('~ 24:00');
    expect(startEndText({ startAt: kst(14, 23, 30), endAt: kst(15, 0, 30) })).toBe(
      '~ 다음 날 00:30',
    );
  });
});
