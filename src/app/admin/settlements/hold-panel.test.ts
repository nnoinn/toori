// 예약 상세의 정산 보류 칸(#373 ②): 버튼을 숨기는 조건이 서버가 막는 조건(정산 규칙)과 같은지 본다.

import { describe, expect, it } from 'vitest';

import { type ReservationHoldInput, reservationHoldBlock } from './hold-panel';

const START = new Date('2026-11-15T06:00:00.000Z');
const LATER = new Date('2026-11-15T07:00:00.000Z');

function input(extra: Partial<ReservationHoldInput> = {}): ReservationHoldInput {
  return {
    status: 'completed',
    visitResult: 'visited',
    visitRecordedAt: LATER,
    cancelledAt: null,
    cancelActor: null,
    voidedAt: null,
    startAt: START,
    refunds: [],
    settlementBundled: false,
    ...extra,
  };
}

const cancelled = (actor: string, refunds: ReservationHoldInput['refunds']) =>
  input({
    status: 'cancelled',
    visitResult: null,
    visitRecordedAt: null,
    cancelledAt: LATER,
    cancelActor: actor,
    refunds,
  });

describe('reservationHoldBlock', () => {
  it('방문·노쇼, 끝난 고객 취소·합의 후 취소, 예정 예약은 걸 수 있다', () => {
    expect(reservationHoldBlock(input())).toBeNull();
    expect(reservationHoldBlock(input({ visitResult: 'no_show' }))).toBeNull();
    expect(
      reservationHoldBlock(
        cancelled('customer', [{ reason: 'customer_cancel', status: 'done', penaltyRate: 30 }]),
      ),
    ).toBeNull();
    expect(
      reservationHoldBlock(
        cancelled('agreed', [{ reason: 'agreed_cancel', status: 'done', penaltyRate: 50 }]),
      ),
    ).toBeNull();
    expect(
      reservationHoldBlock(
        input({ status: 'confirmed', visitResult: null, visitRecordedAt: null }),
      ),
    ).toBeNull();
  });

  it('이미 묶였으면 ALREADY_BUNDLED(묶이기 전만, 11/15 nnoinn)', () => {
    expect(reservationHoldBlock(input({ settlementBundled: true }))).toBe('ALREADY_BUNDLED');
  });

  it('정산 줄이 생기지 않는 예약(원장님 사정·자동 취소, 운영자 취소 환불, 무효)은 NOTHING_TO_SETTLE', () => {
    expect(
      reservationHoldBlock(
        cancelled('owner_fault', [{ reason: 'owner_fault', status: 'done', penaltyRate: 0 }]),
      ),
    ).toBe('NOTHING_TO_SETTLE');
    expect(reservationHoldBlock(cancelled('system', []))).toBe('NOTHING_TO_SETTLE');
    expect(
      reservationHoldBlock(
        input({ refunds: [{ reason: 'admin_exception', status: 'done', penaltyRate: 0 }] }),
      ),
    ).toBe('NOTHING_TO_SETTLE');
    // 무효 예약(A-108)도 정산 줄이 없다
    expect(reservationHoldBlock(input({ voidedAt: LATER }))).toBe('NOTHING_TO_SETTLE');
  });
});
