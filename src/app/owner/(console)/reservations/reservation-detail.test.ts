import { describe, expect, it } from 'vitest';

import {
  bookerName,
  reservationView,
  showsFullPhone,
  VISIT_ACTIONS,
  visitFailShowsNewState,
  visitSummary,
} from './reservation-detail';

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

  it('예약자 이름은 앞뒤 공백을 빼고, 비어 있으면 없음(null)이다(#375)', () => {
    expect(bookerName('김투리')).toBe('김투리');
    expect(bookerName('  김투리  ')).toBe('김투리');
    expect(bookerName('')).toBeNull();
    expect(bookerName('   ')).toBeNull();
  });
});

describe('방문 완료·노쇼 처리 (O14, S-405·S-406)', () => {
  it('노쇼 확인 창만 결제 금액이 환불되지 않는다고 알린다', () => {
    expect(VISIT_ACTIONS.no_show.consequence).toContain('환불되지 않고');
    expect(VISIT_ACTIONS.visited.consequence).toBeNull();
  });

  it('그 사이 처리됐거나 취소됐으면 화면을 다시 받고, 다른 실패는 문구만 보여준다', () => {
    expect(visitFailShowsNewState('ALREADY_RECORDED')).toBe(true);
    expect(visitFailShowsNewState('NOT_RESERVED')).toBe(true);
    expect(visitFailShowsNewState('TOO_EARLY')).toBe(false);
    expect(visitFailShowsNewState('RESERVATION_NOT_FOUND')).toBe(false);
    expect(visitFailShowsNewState('UNAUTHENTICATED')).toBe(false);
  });

  it('확인 창의 예약 한 줄: 한국 시각·메뉴·예약번호(대시보드와 같은 문구)', () => {
    expect(
      visitSummary({
        startAt: new Date('2026-11-01T14:00:00+09:00'),
        menuName: '커트',
        code: 'AXLPLPSG',
      }),
    ).toBe('11/1(일) 14:00 커트 · 예약번호 AXLPLPSG');
  });
});
