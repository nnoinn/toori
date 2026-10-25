// 할인·가격 정책 (연결 #5, Issue #48 3장, S-202, S-203).

/** 원장님이 고를 수 있는 할인율(%) */
export const DISCOUNT_RATE_OPTIONS = [10, 20, 30, 40, 50] as const;

export type DiscountRate = (typeof DISCOUNT_RATE_OPTIONS)[number];

/** 최저 할인율(%) */
export const MIN_DISCOUNT_RATE = 10;

/**
 * 할인가(판매가) = 정가 × (1 − 할인율). 100원 단위로 올리지 않고 원 미만만 버린다.
 * 올리면 실제 할인율이 표시한 할인율보다 작아져 할인 표시에 법적인 문제가 생길 수 있다.
 * 예: 33,500원·30% → 23,450원. 소수 계산 오차가 없게 정수로만 계산한다.
 * 할인율이 선택지 안인지는 부르는 쪽(서버 검증)에서 DISCOUNT_RATE_OPTIONS로 확인한다.
 */
export function calcSalePrice(listPrice: number, discountRate: number): number {
  return Math.floor((listPrice * (100 - discountRate)) / 100);
}
