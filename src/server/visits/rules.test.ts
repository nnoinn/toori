// 방문·노쇼를 처리할 수 있는지(visitBlockReason, canRecordVisit). 시작 시각 경계와 예약 상태별로 본다.

import { describe, expect, it } from 'vitest';

import { canRecordVisit, visitBlockReason, type VisitTarget } from './rules';

const START = new Date('2026-11-01T01:00:00.000Z'); // 한국 시간 11/1 10:00
const at = (ms: number) => new Date(START.getTime() + ms);

function target(extra: Partial<VisitTarget> = {}): VisitTarget {
  return { status: 'confirmed', visitResult: null, startAt: START, ...extra };
}

describe('visitBlockReason', () => {
  it('예약됨이고 시작 시각이 되면 처리할 수 있다(딱 시작 시각 포함)', () => {
    expect(visitBlockReason(target(), at(0))).toBeNull();
    expect(visitBlockReason(target(), at(3 * 60 * 60 * 1000))).toBeNull();
  });

  it('시작 1ms 전이면 TOO_EARLY', () => {
    expect(visitBlockReason(target(), at(-1))).toBe('TOO_EARLY');
  });

  it('취소된 예약은 시작 전후 상관없이 NOT_RESERVED', () => {
    expect(visitBlockReason(target({ status: 'cancelled' }), at(60_000))).toBe('NOT_RESERVED');
    expect(visitBlockReason(target({ status: 'cancelled' }), at(-60_000))).toBe('NOT_RESERVED');
  });

  it('이용 완료이거나 방문 결과가 있으면 ALREADY_RECORDED', () => {
    expect(
      visitBlockReason(target({ status: 'completed', visitResult: 'visited' }), at(60_000)),
    ).toBe('ALREADY_RECORDED');
    expect(visitBlockReason(target({ status: 'completed' }), at(60_000))).toBe('ALREADY_RECORDED');
    expect(visitBlockReason(target({ visitResult: 'no_show' }), at(60_000))).toBe(
      'ALREADY_RECORDED',
    );
  });
});

describe('canRecordVisit', () => {
  it('처리할 수 있을 때만 true', () => {
    expect(canRecordVisit(target(), at(0))).toBe(true);
    expect(canRecordVisit(target(), at(-1))).toBe(false);
    expect(canRecordVisit(target({ status: 'cancelled' }), at(0))).toBe(false);
    expect(canRecordVisit(target({ status: 'completed', visitResult: 'visited' }), at(0))).toBe(
      false,
    );
  });
});
