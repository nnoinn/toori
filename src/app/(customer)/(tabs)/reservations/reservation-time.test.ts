// 기댓값 출처: 영업시간 규칙(기술 가이드 7장 "영업시간", 11/11: 자정 마감은 24:00, 새벽까지 영업)

import { describe, expect, it } from 'vitest';

import { reservationEndText } from './reservation-time';

// 시각은 UTC로 적는다. 한국 시간은 +9시간(2026-11-16 월요일)
const kst = (day: number, hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 10, day, hour - 9, minute)).toISOString();

describe('내 예약 카드 끝 시각', () => {
  it('같은 날 끝나면 그 시각', () => {
    expect(reservationEndText(kst(16, 15), kst(16, 16))).toBe('16:00');
    expect(reservationEndText(kst(16, 22, 30), kst(16, 23, 30))).toBe('23:30');
  });

  it('자정에 끝나면 24:00', () => {
    expect(reservationEndText(kst(16, 23), kst(17, 0))).toBe('24:00');
  });

  it('새벽까지 이어지면 "다음 날"을 붙인다', () => {
    expect(reservationEndText(kst(16, 23), kst(17, 1))).toBe('다음 날 01:00');
    expect(reservationEndText(kst(16, 23, 30), kst(17, 0, 30))).toBe('다음 날 00:30');
  });
});
