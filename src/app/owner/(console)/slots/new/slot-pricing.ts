// 매물 등록 ③ 할인율·신규 고객 전용 입력 검사 (O5, S-202). 화면과 서버가 같이 쓴다.
// 할인율은 정책값 선택지(DISCOUNT_RATE_OPTIONS) 안의 값만 받는다. 판매가는 서버가 calcSalePrice로 다시 계산한다.

import { z } from 'zod';

import { DISCOUNT_RATE_OPTIONS, type DiscountRate } from '@/server/policy';

export function isDiscountRate(value: number): value is DiscountRate {
  return (DISCOUNT_RATE_OPTIONS as readonly number[]).includes(value);
}

export const SLOT_PRICING_ERROR = '할인율을 골라 주세요';

export const slotPricingSchema = z.object({
  discountRate: z.number().int().refine(isDiscountRate),
  newCustomerOnly: z.boolean(),
});

export type SlotPricing = { discountRate: DiscountRate; newCustomerOnly: boolean };

/** ③ 입력을 검사한다. 선택지에 없는 할인율, 빠진 값이면 null */
export function parseSlotPricing(input: unknown): SlotPricing | null {
  const parsed = slotPricingSchema.safeParse(input);
  if (!parsed.success) return null;
  return {
    discountRate: parsed.data.discountRate as DiscountRate,
    newCustomerOnly: parsed.data.newCustomerOnly,
  };
}
