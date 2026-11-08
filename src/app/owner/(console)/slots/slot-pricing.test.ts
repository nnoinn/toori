import { describe, expect, it } from 'vitest';

import { DISCOUNT_RATE_OPTIONS } from '@/server/policy';

import { isDiscountRate, parseSlotPricing } from './slot-pricing';

describe('매물 등록 ③ 입력 검사 (S-202)', () => {
  it.each(DISCOUNT_RATE_OPTIONS)('정책 선택지 할인율 %i%는 받는다', (rate) => {
    expect(parseSlotPricing({ discountRate: rate, newCustomerOnly: false })).toEqual({
      discountRate: rate,
      newCustomerOnly: false,
    });
  });

  it.each([0, 5, 15, 60, 100, 30.5, '30'])('선택지에 없는 할인율 %s는 거절한다', (rate) => {
    expect(parseSlotPricing({ discountRate: rate, newCustomerOnly: false })).toBeNull();
  });

  it('신규 고객 전용 값이 빠지거나 참·거짓이 아니면 거절한다', () => {
    expect(parseSlotPricing({ discountRate: 30 })).toBeNull();
    expect(parseSlotPricing({ discountRate: 30, newCustomerOnly: 'yes' })).toBeNull();
    expect(parseSlotPricing(null)).toBeNull();
  });

  it('신규 고객 전용을 그대로 돌려준다', () => {
    expect(parseSlotPricing({ discountRate: 50, newCustomerOnly: true })?.newCustomerOnly).toBe(
      true,
    );
  });

  it('isDiscountRate는 선택지만 참이다', () => {
    expect(isDiscountRate(10)).toBe(true);
    expect(isDiscountRate(25)).toBe(false);
  });
});
