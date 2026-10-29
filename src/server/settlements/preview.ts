// 원장님 매물 등록 가격 미리보기 (S-203, 연결 #10, #129). 계산만 하는 함수라 화면('use client')에서 바로 부른다.
// 정가·할인율을 바꿀 때마다 즉시 다시 계산한다. 매물을 저장할 때 판매가는 서버가 같은 계산(calcSalePrice)으로 다시 정한다.

import {
  calcSalePrice,
  PAYMENT_FEE_RATE,
  PLATFORM_FEE_MODE,
  type PlatformFeeMode,
} from '@/server/policy';

import { calcSettlementFees } from './calc-settlement';

export type SettlementPreview = {
  /** 할인가 = 정가 × (1 − 할인율), 원 미만 버림 */
  salePrice: number;
  /** 지금 0(오픈 기간) */
  platformFeeRate: number;
  platformFee: number;
  platformFeeVat: number;
  /** 결제 수수료율(판매가의 N%). PG 계약 전이라 정해지기 전에는 null("PG 계약 후 확정") */
  paymentFeeRate: number | null;
  paymentFee: number | null;
  paymentFeeVat: number | null;
  /** 정산 예정액(이용 완료 기준). 결제 수수료율이 정해지기 전에는 null */
  payoutAmount: number | null;
};

/** options는 테스트·법인 전환 확인용. 화면에서는 넘기지 않는다(정책값을 쓴다) */
export function previewSettlement(
  input: { listPrice: number; discountRate: number },
  options: { paymentFeeRate?: number | null; mode?: PlatformFeeMode } = {},
): SettlementPreview {
  const { paymentFeeRate = PAYMENT_FEE_RATE, mode = PLATFORM_FEE_MODE } = options;
  if (!Number.isInteger(input.listPrice) || input.listPrice <= 0) {
    throw new RangeError(`정가가 올바르지 않아요: ${input.listPrice}`);
  }
  const salePrice = calcSalePrice(input.listPrice, input.discountRate);
  // 결제 수수료율이 없으면 플랫폼 수수료만 계산한다(0%를 넣어 계산하고 결제 수수료 칸은 비운다)
  const fees = calcSettlementFees({
    baseAmount: salePrice,
    discountRate: input.discountRate,
    paymentFeeRate: paymentFeeRate ?? 0,
    mode,
  });
  const known = paymentFeeRate !== null;
  return {
    salePrice,
    platformFeeRate: fees.feeRate,
    platformFee: fees.feeAmount,
    platformFeeVat: fees.feeVat,
    paymentFeeRate: known ? fees.paymentFeeRate : null,
    paymentFee: known ? fees.paymentFee : null,
    paymentFeeVat: known ? fees.paymentFeeVat : null,
    payoutAmount: known ? fees.payoutAmount : null,
  };
}
