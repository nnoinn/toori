// 정산 계산 (X-205, 연결 #10, #15 W8). 계산만 하는 함수라 화면과 서버 어디서나 가져올 수 있다.
// 기준: CLAUDE.md 수수료·쿠폰 규칙, 기술 가이드 X-205, docs/settlement-examples.md(테스트 기댓값).
//
// - 원장님 정산은 판매가(쿠폰 적용 전) 기준이다. 쿠폰은 원장님 정산에 영향이 없고 투리 몫에서 정리한다
// - 수수료와 VAT는 원 미만만 버리고 100원 단위로 맞추지 않는다
// - 비율은 만분율 정수로 바꿔 정수로만 계산한다(30,000 × 4.35%를 그냥 곱하면 1,304.99…가 되어 1원 모자라게 버려진다)

import type { SettlementItemKind } from '@/db/schema/settlements';
import {
  DISCOUNT_RATE_OPTIONS,
  getPlatformFeeRate,
  PLATFORM_FEE_MODE,
  type PlatformFeeMode,
  VAT_RATE,
} from '@/server/policy';

function assertAmount(name: string, value: number, { positive = false } = {}): void {
  if (!Number.isInteger(value) || value < 0 || (positive && value === 0)) {
    throw new RangeError(`${name} 값이 올바르지 않아요: ${value}`);
  }
}

/** 퍼센트(소수 둘째 자리까지) → 만분율 정수. 예: 3.3 → 330 */
function toBasisPoints(ratePercent: number): number {
  const basisPoints = Math.round(ratePercent * 100);
  if (
    !Number.isFinite(ratePercent) ||
    ratePercent < 0 ||
    ratePercent > 100 ||
    Math.abs(basisPoints - ratePercent * 100) > 1e-6
  ) {
    throw new RangeError(`수수료율은 0~100%, 소수 둘째 자리까지예요: ${ratePercent}`);
  }
  return basisPoints;
}

/** 금액 × 비율, 원 미만 버림 */
function percentOf(amount: number, basisPoints: number): number {
  return Math.floor((amount * basisPoints) / 10_000);
}

function vatOf(amount: number): number {
  return Math.floor((amount * VAT_RATE) / 100);
}

/**
 * 기준 금액(남은 금액): 이용 완료·노쇼 = 판매가, 고객 취소 = 판매가 × 위약금 비율(원 미만 버림).
 * 고객 취소는 환불 계산(calcRefund)의 원장님 기준 금액과 같은 값이다. 원장님 귀책 취소는 0이라 정산 줄을 만들지 않는다
 */
export function settlementBaseAmount(
  input:
    | { kind: Exclude<SettlementItemKind, 'penalty'>; salePrice: number }
    | { kind: 'penalty'; salePrice: number; penaltyRate: number },
): number {
  assertAmount('판매가', input.salePrice, { positive: true });
  if (input.kind !== 'penalty') return input.salePrice;
  const { penaltyRate } = input;
  if (!Number.isInteger(penaltyRate) || penaltyRate < 0 || penaltyRate > 100) {
    throw new RangeError(`위약금 비율이 올바르지 않아요: ${penaltyRate}`);
  }
  return Math.floor((input.salePrice * penaltyRate) / 100);
}

/** 정산 줄 하나의 수수료와 원장님 정산액. 칸 이름은 settlement_items와 같다 */
export type SettlementFees = {
  baseAmount: number;
  /** 적용한 플랫폼 수수료율(%). 오픈 기간은 0 */
  feeRate: number;
  feeAmount: number;
  feeVat: number;
  /** 적용한 결제 수수료율(판매가의 N%) */
  paymentFeeRate: number;
  paymentFee: number;
  paymentFeeVat: number;
  /** 원장님 정산액 = 기준 금액 − 플랫폼 수수료 − 그 VAT − 결제 수수료 − 그 VAT */
  payoutAmount: number;
};

/**
 * 수수료와 원장님 정산액(패널티를 빼기 전). 결제 수수료율은 정책값 PAYMENT_FEE_RATE를 넘긴다.
 * 결제 수수료율이 아직 정해지지 않았으면(null) 정산을 확정할 수 없으므로 에러를 낸다(미리보기는 previewSettlement)
 */
export function calcSettlementFees(input: {
  baseAmount: number;
  discountRate: number;
  paymentFeeRate: number | null;
  mode?: PlatformFeeMode;
}): SettlementFees {
  const { baseAmount, discountRate, paymentFeeRate, mode = PLATFORM_FEE_MODE } = input;
  assertAmount('기준 금액', baseAmount);
  if (!(DISCOUNT_RATE_OPTIONS as readonly number[]).includes(discountRate)) {
    throw new RangeError(`선택지에 없는 할인율이에요: ${discountRate}%`);
  }
  if (paymentFeeRate === null) {
    throw new Error('결제 수수료율(PAYMENT_FEE_RATE)이 아직 정해지지 않아서 정산할 수 없어요');
  }

  const feeRate = getPlatformFeeRate(discountRate, mode);
  const feeAmount = percentOf(baseAmount, toBasisPoints(feeRate));
  const feeVat = vatOf(feeAmount);
  const paymentFee = percentOf(baseAmount, toBasisPoints(paymentFeeRate));
  const paymentFeeVat = vatOf(paymentFee);
  return {
    baseAmount,
    feeRate,
    feeAmount,
    feeVat,
    paymentFeeRate,
    paymentFee,
    paymentFeeVat,
    payoutAmount: baseAmount - feeAmount - feeVat - paymentFee - paymentFeeVat,
  };
}

export type TuriShare = {
  /** 카드에 남은 돈 = 실제 결제액 − 환불액 */
  cardRemaining: number;
  /** PG가 맡아 둔 돈 = 카드에 남은 돈 − 실제 PG 수수료 − 그 VAT */
  pgHeld: number;
  /** 투리에 남는 돈 = PG가 맡아 둔 돈 − 원장님 정산액. 음수면 다른 거래에서 남은 투리 몫으로 메운다 */
  turiRemaining: number;
  /** 쿠폰 부담분 = 기준 금액 − 카드에 남은 돈(쿠폰을 안 썼으면 0) */
  couponBurden: number;
  /** 투리 손익(부가세 제외) = 플랫폼 수수료 + 결제 수수료 − 실제 PG 수수료 − 쿠폰 부담분 */
  turiProfit: number;
};

/**
 * 거래 하나의 투리 몫(운영자 정산 관리·지표용). 원장님 정산에는 쓰지 않는다.
 * 실제 PG 수수료는 PG가 알려준 값(settlement_items.pg_fee_actual)을 넘긴다
 */
export function calcTuriShare(input: {
  fees: SettlementFees;
  paidAmount: number;
  refundAmount: number;
  pgFee: number;
  pgFeeVat: number;
}): TuriShare {
  const { fees, paidAmount, refundAmount, pgFee, pgFeeVat } = input;
  for (const [name, value] of Object.entries({ paidAmount, refundAmount, pgFee, pgFeeVat })) {
    assertAmount(name, value);
  }
  if (refundAmount > paidAmount) {
    throw new RangeError(`환불액이 결제액보다 커요: ${refundAmount} > ${paidAmount}`);
  }
  const cardRemaining = paidAmount - refundAmount;
  const pgHeld = cardRemaining - pgFee - pgFeeVat;
  const couponBurden = fees.baseAmount - cardRemaining;
  return {
    cardRemaining,
    pgHeld,
    turiRemaining: pgHeld - fees.payoutAmount,
    couponBurden,
    turiProfit: fees.feeAmount + fees.paymentFee - pgFee - couponBurden,
  };
}

export type OutstandingPenalty = {
  penaltyId: string;
  /** 패널티 금액(owner_penalties.amount) */
  amount: number;
  /** 지금까지 걷은 금액(owner_penalties.collected_amount) */
  collectedAmount: number;
  createdAt: Date;
};

/**
 * 원장님 귀책 취소 패널티(S-409, X-207)를 이번 정산액 안에서 오래된 것부터 뗀다.
 * 모자라면 다 걷힐 때까지 다음 정산에서 뗀다(미수가 있어도 이용 제한은 없다, 10/12)
 */
export function allocatePenalties(
  payoutTotal: number,
  penalties: readonly OutstandingPenalty[],
): {
  /** 이번에 뗄 금액(penalty_collections) */
  collections: { penaltyId: string; amount: number }[];
  /** 패널티를 뗀 뒤 지급액 */
  payoutAfter: number;
  /** 다 걷지 못해 다음 정산으로 넘기는 패널티 */
  outstanding: { penaltyId: string; remainingAmount: number }[];
} {
  assertAmount('정산액', payoutTotal);
  let available = payoutTotal;
  const collections: { penaltyId: string; amount: number }[] = [];
  const outstanding: { penaltyId: string; remainingAmount: number }[] = [];
  const oldestFirst = [...penalties].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const penalty of oldestFirst) {
    assertAmount('패널티', penalty.amount);
    assertAmount('걷은 금액', penalty.collectedAmount);
    if (penalty.collectedAmount > penalty.amount) {
      throw new RangeError(`걷은 금액이 패널티보다 커요: ${penalty.penaltyId}`);
    }
    const remaining = penalty.amount - penalty.collectedAmount;
    const take = Math.min(remaining, available);
    if (take > 0) collections.push({ penaltyId: penalty.penaltyId, amount: take });
    available -= take;
    if (remaining > take) {
      outstanding.push({ penaltyId: penalty.penaltyId, remainingAmount: remaining - take });
    }
  }
  return { collections, payoutAfter: available, outstanding };
}
