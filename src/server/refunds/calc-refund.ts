// 환불 계산 (X-202, 연결 #9, #15 W7). 서버에서만 부른다(화면은 직접 계산하지 않고 서버가 서버 시각으로 계산한 결과를 받는다).
// 취소 화면의 환불액 미리보기(C-503)와 실제 환불(W14)이 이 함수 하나를 같이 쓴다. 구간·비율은 정책값 REFUND_BANDS에서 온다.
//
// - 고객 환불은 실제 결제액(쿠폰을 뺀 카드 결제액) 기준, 원장님 정산 기준 금액은 판매가 기준이다(쿠폰 규칙)
// - 원 미만이 생기면 위약금을 버린다. 고객 환불이 표시한 비율보다 적어지지 않게 하려고(10/28 강규민 결정)
// - 노쇼는 환불이 없어서 여기서 계산하지 않는다(위약금 100%, 정산 기준은 판매가, NO_SHOW_PENALTY_RATE)

import 'server-only';

import type { RefundBand } from '@/db/schema/refunds';
import { hoursUntil } from '@/lib/time';
import { REFUND_BANDS } from '@/server/policy';

/** 정책값 구간(minHoursLeft)마다 DB에 남기는 구간 이름(refunds.band) */
const BAND_BY_MIN_HOURS: Record<number, RefundBand> = {
  24: 'over_24h',
  6: '6h_to_24h',
  0: 'under_6h',
};

/** 서비스 시작까지 남은 시간의 위약금 구간. 시작 시각이 지났으면 마지막 구간(100%) */
export function getPenaltyBand(
  startAt: Date,
  now: Date,
): { band: RefundBand; penaltyRate: number } {
  const hoursLeft = hoursUntil(startAt, now);
  const matched =
    REFUND_BANDS.find((b) => hoursLeft >= b.minHoursLeft) ?? REFUND_BANDS[REFUND_BANDS.length - 1];
  const band = BAND_BY_MIN_HOURS[matched.minHoursLeft];
  if (!band) throw new Error(`환불 구간 이름이 없어요: ${matched.minHoursLeft}시간`);
  return { band, penaltyRate: matched.penaltyRate };
}

export type RefundCalc = {
  /** refunds.band. 원장님 귀책이면 null */
  band: RefundBand | null;
  /** 위약금 비율(%) */
  penaltyRate: number;
  /** 고객에게 돌려줄 금액(실제 결제액 기준) */
  refundAmount: number;
  /** 결제액 − 환불액(refunds.penalty_amount) */
  penaltyAmount: number;
  /** 원장님 정산 기준 금액 = 판매가 × 위약금 비율(정산 계산 W8). 원장님 귀책이면 0 */
  ownerBaseAmount: number;
  /** 돌려줄 돈이 있는지. 없으면 취소 화면은 취소 버튼 대신 안내를 보여준다(C-503) */
  refundable: boolean;
};

/**
 * 예약 취소의 환불액. now는 서버 시각(getRequestNow)을 넘긴다.
 * paidAmount: 고객 실제 결제액(쿠폰을 뺀 금액), salePrice: 판매가(쿠폰 적용 전)
 */
export function calcRefund(input: {
  paidAmount: number;
  salePrice: number;
  startAt: Date;
  now: Date;
  /** 기본은 고객 취소. 원장님 귀책이면 남은 시간과 상관없이 전액 환불(S-409) */
  reason?: 'customer_cancel' | 'owner_fault';
}): RefundCalc {
  const { paidAmount, salePrice } = input;
  if (!Number.isInteger(salePrice) || salePrice <= 0) {
    throw new RangeError(`판매가가 올바르지 않아요: ${salePrice}`);
  }
  if (!Number.isInteger(paidAmount) || paidAmount < 0 || paidAmount > salePrice) {
    throw new RangeError(`결제액이 올바르지 않아요: ${paidAmount}`);
  }

  if (input.reason === 'owner_fault') {
    return {
      band: null,
      penaltyRate: 0,
      refundAmount: paidAmount,
      penaltyAmount: 0,
      ownerBaseAmount: 0,
      refundable: paidAmount > 0,
    };
  }

  const { band, penaltyRate } = getPenaltyBand(input.startAt, input.now);
  // 정수로만 계산한다(소수 오차 없이). 원 미만은 위약금에서 버린다
  const penaltyAmount = Math.floor((paidAmount * penaltyRate) / 100);
  const refundAmount = paidAmount - penaltyAmount;
  return {
    band,
    penaltyRate,
    refundAmount,
    penaltyAmount,
    ownerBaseAmount: Math.floor((salePrice * penaltyRate) / 100),
    refundable: refundAmount > 0,
  };
}
