import { describe, expect, it } from 'vitest';

import {
  getPlatformFeeRate,
  MIN_PLATFORM_FEE_RATE,
  PAYMENT_FEE_RATE,
  PLATFORM_FEE_MODE,
} from './fees';
import { DISCOUNT_RATE_OPTIONS } from './pricing';

describe('getPlatformFeeRate (X-205, #48 4장)', () => {
  it('지금은 오픈 기간 방식(launch)이다', () => {
    expect(PLATFORM_FEE_MODE).toBe('launch');
  });

  it('오픈 기간(launch)에는 할인율과 상관없이 0%다(settlement-examples 3장)', () => {
    for (const rate of DISCOUNT_RATE_OPTIONS) {
      expect(getPlatformFeeRate(rate)).toBe(0);
      expect(getPlatformFeeRate(rate, 'launch')).toBe(0);
    }
  });

  it('법인 전환 뒤(tiered)에는 할인율별 표를 쓴다(settlement-examples 4장)', () => {
    expect(DISCOUNT_RATE_OPTIONS.map((rate) => getPlatformFeeRate(rate, 'tiered'))).toEqual([
      10, 9, 8, 7, 6,
    ]);
  });

  it('tiered 수수료율은 하한(6%) 밑으로 내려가지 않는다', () => {
    for (const rate of DISCOUNT_RATE_OPTIONS) {
      expect(getPlatformFeeRate(rate, 'tiered')).toBeGreaterThanOrEqual(MIN_PLATFORM_FEE_RATE);
    }
  });

  it('tiered에서 표에 없는 할인율이면 에러를 낸다', () => {
    expect(() => getPlatformFeeRate(15, 'tiered')).toThrow(RangeError);
  });
});

describe('결제 수수료율', () => {
  it('PG 계약 전이라 비어 있다(임의 숫자를 넣지 않는다)', () => {
    expect(PAYMENT_FEE_RATE).toBeNull();
  });
});
