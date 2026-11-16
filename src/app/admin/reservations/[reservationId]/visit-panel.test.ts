// 운영자 예약 상세 "방문·노쇼" 칸 (#373 ③, 11/16).

import { describe, expect, it } from 'vitest';

import { visitPanel } from './visit-panel';

const START = new Date('2026-11-16T06:00:00.000Z');
const RECORDED = new Date('2026-11-16T07:30:00.000Z');
const base = {
  status: 'confirmed' as const,
  visitResult: null,
  visitRecordedAt: null,
  startAt: START,
  disputeOpen: false,
  settlementBundled: false,
};

describe('방문·노쇼 칸', () => {
  it('시작 전이면 시작 시각부터, 딱 시작 시각부터 대신 처리할 수 있다', () => {
    expect(visitPanel(base, new Date(START.getTime() - 1))).toEqual({
      kind: 'before_start',
      startAt: START,
    });
    expect(visitPanel(base, START)).toEqual({ kind: 'can_record' });
  });

  it('취소된 예약은 처리하지 않는다', () => {
    expect(visitPanel({ ...base, status: 'cancelled' }, RECORDED)).toEqual({ kind: 'cancelled' });
  });

  it('방문 완료는 처리 시각만 보여 준다', () => {
    expect(
      visitPanel(
        { ...base, status: 'completed', visitResult: 'visited', visitRecordedAt: RECORDED },
        RECORDED,
      ),
    ).toEqual({ kind: 'visited', recordedAt: RECORDED });
  });

  it('노쇼는 되돌릴 수 있고, 이의제기가 확인 중이면(먼저) 또는 정산에 묶였으면 막는다', () => {
    const noShow = {
      ...base,
      status: 'completed' as const,
      visitResult: 'no_show' as const,
      visitRecordedAt: RECORDED,
    };
    expect(visitPanel(noShow, RECORDED)).toEqual({
      kind: 'no_show',
      recordedAt: RECORDED,
      reverseBlock: null,
    });
    expect(visitPanel({ ...noShow, settlementBundled: true }, RECORDED)).toMatchObject({
      reverseBlock: 'SETTLEMENT_BUNDLED',
    });
    expect(
      visitPanel({ ...noShow, disputeOpen: true, settlementBundled: true }, RECORDED),
    ).toMatchObject({ reverseBlock: 'DISPUTE_OPEN' });
  });
});
