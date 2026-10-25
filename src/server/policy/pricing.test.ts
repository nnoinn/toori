import { describe, expect, it } from 'vitest';

import { calcSalePrice, DISCOUNT_RATE_OPTIONS, MIN_DISCOUNT_RATE } from './pricing';

describe('calcSalePrice (S-203, #48 3장)', () => {
  it('정가 × (1 − 할인율)을 그대로 쓰고 100원 단위로 올리지 않는다', () => {
    expect(calcSalePrice(33500, 30)).toBe(23450);
    expect(calcSalePrice(20000, 30)).toBe(14000);
    expect(calcSalePrice(45000, 10)).toBe(40500);
  });

  it('원 미만은 버린다', () => {
    // 33,333 × 0.7 = 23,333.1
    expect(calcSalePrice(33333, 30)).toBe(23333);
    // 12,345 × 0.5 = 6,172.5
    expect(calcSalePrice(12345, 50)).toBe(6172);
  });

  it('정가가 10원 단위면 원 미만이 생기지 않는다(모든 할인율)', () => {
    for (const rate of DISCOUNT_RATE_OPTIONS) {
      const exact = (33510 * (100 - rate)) / 100;
      expect(calcSalePrice(33510, rate)).toBe(exact);
    }
  });
});

describe('할인율 선택지 (S-202)', () => {
  it('10/20/30/40/50%이고 가장 낮은 값이 최저 할인율이다', () => {
    expect(DISCOUNT_RATE_OPTIONS).toEqual([10, 20, 30, 40, 50]);
    expect(Math.min(...DISCOUNT_RATE_OPTIONS)).toBe(MIN_DISCOUNT_RATE);
  });
});
