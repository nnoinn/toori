// 예약 무효(A-108, #423)의 판단: 막는 이유의 순서와 돌려줄 금액(남은 금액, 진행 중이면 저장한 금액)을 본다.

import { describe, expect, it } from 'vitest';

import { voidBlockReason, voidRefundAmount } from './void-rules';

const base = {
  voidedAt: null,
  settlementBundled: false,
  cancelInProgress: false,
  paidAmount: 42_000,
  refundedAmount: 0,
  voidRequested: null,
};

describe('voidBlockReason', () => {
  it('막을 이유가 없으면 null(예정·취소·완료 모두 무효로 할 수 있다)', () => {
    expect(voidBlockReason(base)).toBeNull();
  });

  it('이미 무효 > 정산에 묶임 > 다른 취소 진행 중 순서로 하나만 준다', () => {
    expect(
      voidBlockReason({
        ...base,
        voidedAt: new Date('2026-11-16T01:00:00.000Z'),
        settlementBundled: true,
        cancelInProgress: true,
      }),
    ).toBe('ALREADY_VOIDED');
    expect(voidBlockReason({ ...base, settlementBundled: true, cancelInProgress: true })).toBe(
      'SETTLEMENT_BUNDLED',
    );
    expect(voidBlockReason({ ...base, cancelInProgress: true })).toBe('CANCEL_IN_PROGRESS');
  });
});

describe('voidRefundAmount', () => {
  it('실제 결제액 전부(쿠폰은 결제액에 들어 있지 않다)', () => {
    expect(voidRefundAmount(base)).toBe(42_000);
  });

  it('고객 취소로 일부 돌려줬으면 나머지만(30시간 전 취소 70% 환불 → 30%)', () => {
    expect(voidRefundAmount({ ...base, refundedAmount: 29_400 })).toBe(12_600);
  });

  it('이미 다 돌려줬거나 0원 결제면 0', () => {
    expect(voidRefundAmount({ ...base, refundedAmount: 42_000 })).toBe(0);
    expect(voidRefundAmount({ ...base, paidAmount: 0 })).toBe(0);
  });

  it('진행 중인 무효가 있으면 처음 저장한 금액으로 이어서 한다', () => {
    expect(
      voidRefundAmount({
        ...base,
        refundedAmount: 29_400,
        voidRequested: { refundAmount: 12_600 },
      }),
    ).toBe(12_600);
  });
});
