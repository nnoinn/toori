import { describe, expect, it } from 'vitest';

import { refundHistory } from './refund-history';

const CANCEL = {
  reason: 'customer_cancel' as const,
  refundAmount: 29400,
  penaltyAmount: 12600,
  penaltyRate: 30,
  processedAt: '2026-11-20T01:00:00.000Z',
};
const VOID_REST = {
  reason: 'void' as const,
  refundAmount: 12600,
  penaltyAmount: 0,
  penaltyRate: 0,
  processedAt: '2026-11-21T01:00:00.000Z',
};

// 예약 상세 환불 내역(#528 제안 4번, 11/21 정찬형). 금액 출처: docs/test-scenarios.md VOID-02
// (42,000원 결제에 고객 취소로 29,400원을 돌려줬으면 무효로 나머지 12,600원)
describe('환불 내역', () => {
  it('환불이 없으면 칸을 그리지 않는다', () => {
    expect(refundHistory([])).toBeNull();
  });

  it('고객 취소 한 번이면 지금처럼 이름 없이 금액·위약금·처리 시각', () => {
    expect(refundHistory([CANCEL])).toEqual({
      rows: [
        {
          label: null,
          refundAmount: 29400,
          penalty: { amount: 12600, rate: 30 },
          processedAt: CANCEL.processedAt,
        },
      ],
      total: null,
    });
  });

  it('무효 환불만 있으면 위약금 줄을 빼고 이름도 없다', () => {
    expect(refundHistory([{ ...VOID_REST, refundAmount: 42000 }])).toEqual({
      rows: [
        { label: null, refundAmount: 42000, penalty: null, processedAt: VOID_REST.processedAt },
      ],
      total: null,
    });
  });

  it('고객 취소 뒤 무효면 두 줄 모두 이름을 붙이고, 돌려받은 금액 합계는 결제액 전부', () => {
    expect(refundHistory([CANCEL, VOID_REST])).toEqual({
      rows: [
        {
          label: '예약 취소',
          refundAmount: 29400,
          penalty: { amount: 12600, rate: 30 },
          processedAt: CANCEL.processedAt,
        },
        {
          label: '예약 무효',
          refundAmount: 12600,
          penalty: null,
          processedAt: VOID_REST.processedAt,
        },
      ],
      total: 42000,
    });
  });

  it('처리된 순서(오래된 것부터)로 보여 준다', () => {
    const history = refundHistory([VOID_REST, CANCEL]);
    expect(history?.rows.map((row) => row.label)).toEqual(['예약 취소', '예약 무효']);
  });
});
