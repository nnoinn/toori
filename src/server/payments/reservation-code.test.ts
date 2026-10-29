// 예약번호 (C-405, #17 Q10): 영문 대문자+숫자 8자리, 0/O·1/I 없음.

import { describe, expect, it } from 'vitest';

import { newReservationCode, RESERVATION_CODE_PATTERN } from './reservation-code';

describe('newReservationCode', () => {
  it('8자리이고 헷갈리는 글자(0, O, 1, I)를 쓰지 않는다', () => {
    const codes = Array.from({ length: 500 }, newReservationCode);
    for (const code of codes) {
      expect(code).toMatch(RESERVATION_CODE_PATTERN);
      expect(code).not.toMatch(/[0O1I]/);
    }
  });

  it('매번 다르게 만든다', () => {
    expect(new Set(Array.from({ length: 100 }, newReservationCode)).size).toBe(100);
  });
});
