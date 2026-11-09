import { describe, expect, it } from 'vitest';

import { formatReservationCode, splitReservationCode } from './reservation-code';

describe('예약번호 표시', () => {
  it('숫자 12자리는 4자리씩 끊는다', () => {
    expect(formatReservationCode('123456789012')).toBe('1234-5678-9012');
    expect(formatReservationCode('000012340000')).toBe('0000-1234-0000');
  });

  it('맨 뒤 4자리를 따로 나눈다(원장님이 끝자리로 맞춰 보기)', () => {
    expect(splitReservationCode('123456789012')).toEqual({ head: '1234-5678-', tail: '9012' });
  });

  it('숫자 12자리가 아니면(예전 영문+숫자 8자리 등) 그대로 둔다', () => {
    for (const code of ['AXLPLPSG', '2779GY6J', '12345678901', '1234567890123', '1234-5678-9012']) {
      expect(splitReservationCode(code)).toEqual({ head: code, tail: '' });
      expect(formatReservationCode(code)).toBe(code);
    }
  });
});
