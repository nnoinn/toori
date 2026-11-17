// 예약 무효(A-108, #423)의 판단. 계산만 한다. 운영자 서버 함수(void-reservation.ts)와 저장(void-store.ts)이 같이 쓴다.

import type { VoidPreview } from './types';

/** 무효로 할 수 없는 이유 */
export type VoidBlockReason = NonNullable<VoidPreview['blockReason']>;

/** 판단에 필요한 예약 값(void-store의 VoidTarget) */
type VoidState = {
  voidedAt: Date | null;
  /** 정산에 묶인 줄이 있다 */
  settlementBundled: boolean;
  /** 다른 취소 환불이 진행 중이다 */
  cancelInProgress: boolean;
  /** 실제 결제액 */
  paidAmount: number;
  /** 이미 돌려준 금액 */
  refundedAmount: number;
  /** 진행 중인 무효 환불 */
  voidRequested: { refundAmount: number } | null;
};

/**
 * 새로 무효를 시작할 수 없는 이유. 없으면 null.
 * 정산에 묶인 예약은 막는다(11/15 nnoinn, 묶인 뒤 지급 전 무효는 A-105에서 다시 본다)
 */
export function voidBlockReason(target: VoidState): VoidBlockReason | null {
  if (target.voidedAt) return 'ALREADY_VOIDED';
  if (target.settlementBundled) return 'SETTLEMENT_BUNDLED';
  if (target.cancelInProgress) return 'CANCEL_IN_PROGRESS';
  return null;
}

/**
 * 이번에 돌려줄 금액 = 실제 결제액 − 이미 돌려준 금액(고객 취소로 일부 돌려줬으면 나머지).
 * 진행 중인 무효가 있으면 처음 저장한 금액으로 이어서 한다
 */
export function voidRefundAmount(target: VoidState): number {
  if (target.voidRequested) return target.voidRequested.refundAmount;
  return Math.max(0, target.paidAmount - target.refundedAmount);
}
