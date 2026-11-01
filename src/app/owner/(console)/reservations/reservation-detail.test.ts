import { describe, expect, it } from 'vitest';

import { maskPhone, reservationView, showsFullPhone } from './reservation-detail';

const startAt = new Date('2026-11-01T14:00:00+09:00');
const before = new Date('2026-11-01T13:59:00+09:00');
const after = new Date('2026-11-01T14:00:00+09:00');

describe('원장님 예약 상세 (O11, S-403)', () => {
  it('예약 상태: 시작 전 예정, 시작부터 방문 처리 필요, 처리·취소 뒤에는 그 결과', () => {
    const confirmed = { status: 'confirmed', visitResult: null, startAt } as const;
    expect(reservationView(confirmed, before)).toBe('upcoming');
    // 시작 시각부터 처리할 수 있다(canRecordVisit과 같은 경계)
    expect(reservationView(confirmed, after)).toBe('needsVisit');
    expect(reservationView({ status: 'completed', visitResult: 'visited', startAt }, after)).toBe(
      'visited',
    );
    expect(reservationView({ status: 'completed', visitResult: 'no_show', startAt }, after)).toBe(
      'noShow',
    );
    expect(reservationView({ status: 'cancelled', visitResult: null, startAt }, before)).toBe(
      'cancelled',
    );
  });

  it('연락처는 처리 전 예약만 다 보여주고, 처리했거나 취소됐으면 가린다(#21 Q11)', () => {
    expect(showsFullPhone({ status: 'confirmed', visitResult: null, startAt })).toBe(true);
    expect(showsFullPhone({ status: 'completed', visitResult: 'visited', startAt })).toBe(false);
    expect(showsFullPhone({ status: 'completed', visitResult: 'no_show', startAt })).toBe(false);
    expect(showsFullPhone({ status: 'cancelled', visitResult: null, startAt })).toBe(false);
  });

  it('휴대폰 번호는 가운데만 가린다', () => {
    expect(maskPhone('010-1234-5678')).toBe('010-****-5678');
    expect(maskPhone('010-123-5678')).toBe('010-***-5678');
    // 하이픈 모양이 아니면 뒷자리 4개만
    expect(maskPhone('01012345678')).toBe('****5678');
  });
});
