// 예약번호 (C-405, #17 Q10, #262): 숫자 12자리, 맨 앞 0도 된다. 원장님은 끝 4자리로 확인한다.

import { describe, expect, it } from 'vitest';

import {
  newReservationCode,
  RESERVATION_CODE_PATTERN,
  reservationCodeTail,
} from './reservation-code';

describe('newReservationCode', () => {
  it('숫자 12자리이고 하이픈이 없다', () => {
    for (const code of Array.from({ length: 500 }, newReservationCode)) {
      expect(code).toMatch(RESERVATION_CODE_PATTERN);
    }
  });

  it('맨 앞 0도 나온다(숫자가 아니라 글자로 다룬다)', () => {
    const codes = Array.from({ length: 500 }, newReservationCode);
    expect(codes.some((code) => code.startsWith('0'))).toBe(true);
  });

  it('매번 다르게 만든다', () => {
    expect(new Set(Array.from({ length: 100 }, newReservationCode)).size).toBe(100);
  });
});

describe('reservationCodeTail', () => {
  it('끝 4자리', () => {
    expect(reservationCodeTail('123456780042')).toBe('0042');
  });

  it('예전 8자리 번호도 끝 4자리', () => {
    expect(reservationCodeTail('AB3K9XYZ')).toBe('9XYZ');
  });
});
