// 합의 후 취소 계산·규칙 (X-208, 11/8 결정). 손님 환불(결제액 × 50%)과 원장님 기준 금액(판매가 × 50%), 요청할 수 있는 예약을 본다.

import { describe, expect, it } from 'vitest';

import { AGREED_CANCEL_REFUND_RATE } from '@/server/policy/refund';

import { calcAgreedCancel, isAgreedCancelTarget } from './agreed-cancel-rules';

describe('calcAgreedCancel', () => {
  it('환불율은 50%이고, 쿠폰이 없으면 손님 환불과 원장님 기준 금액이 같다', () => {
    expect(AGREED_CANCEL_REFUND_RATE).toBe(50);
    expect(calcAgreedCancel({ paidAmount: 23_450, salePrice: 23_450 })).toEqual({
      refundAmount: 11_725,
      baseAmount: 11_725,
    });
  });

  it('쿠폰을 썼으면 손님 환불은 실제 결제액 기준, 원장님 기준 금액은 판매가 기준(쿠폰은 돌려주지 않는다)', () => {
    expect(calcAgreedCancel({ paidAmount: 20_450, salePrice: 23_450 })).toEqual({
      refundAmount: 10_225,
      baseAmount: 11_725,
    });
  });

  it('원 미만은 버린다', () => {
    expect(calcAgreedCancel({ paidAmount: 14_005, salePrice: 14_005 })).toEqual({
      refundAmount: 7002,
      baseAmount: 7002,
    });
  });

  it('금액이 정수가 아니거나 음수면 멈춘다', () => {
    expect(() => calcAgreedCancel({ paidAmount: -1, salePrice: 100 })).toThrow(RangeError);
    expect(() => calcAgreedCancel({ paidAmount: 100, salePrice: 1.5 })).toThrow(RangeError);
  });
});

describe('isAgreedCancelTarget', () => {
  it('예정 예약이고 방문·노쇼 처리 전일 때만', () => {
    expect(isAgreedCancelTarget({ status: 'confirmed', visitResult: null })).toBe(true);
    expect(isAgreedCancelTarget({ status: 'cancelled', visitResult: null })).toBe(false);
    expect(isAgreedCancelTarget({ status: 'completed', visitResult: 'visited' })).toBe(false);
    expect(isAgreedCancelTarget({ status: 'completed', visitResult: 'no_show' })).toBe(false);
  });
});
