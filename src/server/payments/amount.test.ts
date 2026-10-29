// 결제 금액 (X-201, C-407). 판매가에서 쿠폰을 뺀 금액이 포트원 결제액이자 검증 기준이다.

import { describe, expect, it } from 'vitest';

import { calcPaymentAmount } from './amount';

describe('calcPaymentAmount', () => {
  it('쿠폰이 없으면 판매가 그대로', () => {
    expect(calcPaymentAmount({ salePrice: 23_450 })).toEqual({
      salePrice: 23_450,
      couponAmount: 0,
      amount: 23_450,
    });
  });

  it('쿠폰을 쓰면 판매가 − 쿠폰(settlement-examples.md 3장: 45,000원 − 3,000원)', () => {
    expect(calcPaymentAmount({ salePrice: 45_000, couponAmount: 3_000 })).toMatchObject({
      couponAmount: 3_000,
      amount: 42_000,
    });
  });

  it('쿠폰이 판매가보다 크면 판매가까지만 뺀다(결제액 0원)', () => {
    expect(calcPaymentAmount({ salePrice: 2_500, couponAmount: 3_000 })).toEqual({
      salePrice: 2_500,
      couponAmount: 2_500,
      amount: 0,
    });
  });

  it.each([
    ['판매가 0', { salePrice: 0 }],
    ['판매가 소수', { salePrice: 100.5 }],
    ['쿠폰 음수', { salePrice: 10_000, couponAmount: -1 }],
  ])('%s → 에러', (_, input) => {
    expect(() => calcPaymentAmount(input)).toThrow(RangeError);
  });
});
