// 수수료 정책 (연결 #5, Issue #48 4장, X-205, S-203). 계산 예시는 docs/settlement-examples.md 3장·4장.
// 수수료는 판매가(할인가, 쿠폰 적용 전) 기준이고 VAT 별도다. 고객에게는 어떤 수수료도 붙이지 않는다.

/**
 * 플랫폼 수수료(투리의 중개 수수료) 방식.
 * launch = 오픈 기간 0%(10/14 결정), tiered = 할인율별 표(법인 전환 뒤 공급자 약관을 바꿀 때)
 */
export type PlatformFeeMode = 'launch' | 'tiered';

/** 지금 적용하는 방식. 법인 전환 때 이 값만 'tiered'로 바꾼다 */
export const PLATFORM_FEE_MODE: PlatformFeeMode = 'launch';

/** 할인율(%)별 플랫폼 수수료율(%). tiered에서만 쓴다(지우지 않고 보관) */
export const PLATFORM_FEE_RATE_BY_DISCOUNT: Readonly<Record<number, number>> = {
  10: 10,
  20: 9,
  30: 8,
  40: 7,
  50: 6,
};

/** 플랫폼 수수료율 하한(%). tiered에서만 쓴다 */
export const MIN_PLATFORM_FEE_RATE = 6;

/**
 * 플랫폼 수수료율(%). 화면(S-203)과 정산(W8)은 표를 직접 읽지 않고 이 함수만 쓴다.
 * tiered에서 표에 없는 할인율이면 엉뚱한 수수료로 계산하지 않도록 에러를 낸다.
 */
export function getPlatformFeeRate(
  discountRate: number,
  mode: PlatformFeeMode = PLATFORM_FEE_MODE,
): number {
  if (mode === 'launch') return 0;
  const rate = PLATFORM_FEE_RATE_BY_DISCOUNT[discountRate];
  if (rate === undefined) {
    throw new RangeError(`수수료율 표에 없는 할인율이에요: ${discountRate}%`);
  }
  return Math.max(rate, MIN_PLATFORM_FEE_RATE);
}

/** 수수료 VAT(%) */
export const VAT_RATE = 10;

/**
 * 결제 수수료율(판매가의 N%, VAT 별도). 투리의 결제·정산 처리 대가로 원장님 정산액에서 뺀다(10/12).
 * PG 계약 뒤 정한다. 그 전에는 비워 두고, 이 값을 쓰는 화면은 "[미정]"으로 보여준다
 */
export const PAYMENT_FEE_RATE: number | null = null;
