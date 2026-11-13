// 합의 후 취소 계산과 규칙 (X-208, #301, 11/8·11/10 결정). 계산만 한다. 화면은 이 계산 대신 함수 결과를 쓴다.
// - 손님 환불 = 실제 결제액 − 위약금(실제 결제액 × 50%, 원 미만 버림). 원 미만은 고객 취소처럼 손님 쪽으로 맞춘다(11/12).
//   쓴 쿠폰은 돌려주지 않는다
// - 원장님 기준 금액 = 판매가 × (100 − 50)%(원 미만 버림). 수수료는 고객 취소 위약금과 같은 방식(정산 W20)
// - 요청은 예정 예약(방문·노쇼 처리 전, 서비스 시작 뒤 포함)에만, 답을 기다리는 요청은 한 번에 하나

import type { ReservationStatus, VisitResult } from '@/db/schema/payments';
import type { AgreedCancelRequestStatus } from '@/db/schema/refunds';
import { AGREED_CANCEL_REFUND_RATE } from '@/server/policy/refund';

/** 손님 환불액과 원장님 기준 금액 */
export function calcAgreedCancel({
  paidAmount,
  salePrice,
}: {
  paidAmount: number;
  salePrice: number;
}): { refundAmount: number; baseAmount: number } {
  if (!Number.isInteger(paidAmount) || paidAmount < 0) {
    throw new RangeError(`결제액이 올바르지 않아요: ${paidAmount}`);
  }
  if (!Number.isInteger(salePrice) || salePrice < 0) {
    throw new RangeError(`판매가가 올바르지 않아요: ${salePrice}`);
  }
  // 위약금 쪽에서 원 미만을 버려서 손님 환불이 표시한 비율보다 적어지지 않게 한다(calcRefund와 같은 방식)
  const penaltyAmount = Math.floor((paidAmount * (100 - AGREED_CANCEL_REFUND_RATE)) / 100);
  return {
    refundAmount: paidAmount - penaltyAmount,
    baseAmount: Math.floor((salePrice * (100 - AGREED_CANCEL_REFUND_RATE)) / 100),
  };
}

/** 합의 후 취소를 요청·처리할 수 있는 예약인지: 예정(confirmed)이고 방문·노쇼 처리 전 */
export function isAgreedCancelTarget(reservation: {
  status: ReservationStatus;
  visitResult: VisitResult | null;
}): boolean {
  return reservation.status === 'confirmed' && reservation.visitResult === null;
}

/**
 * 저장된 요청의 지금 상태. 상태를 바꾸기 전이라도 만료 시각이 지났으면 expired(#320 리뷰),
 * 손님이 답하기 전에 예약이 바뀌었으면(취소, 방문·노쇼 처리) closed로 본다
 */
export function currentRequestStatus(
  request: { status: AgreedCancelRequestStatus; expiresAt: Date },
  reservation: { status: ReservationStatus; visitResult: VisitResult | null },
  now: Date,
): AgreedCancelRequestStatus {
  if (request.status !== 'requested') return request.status;
  if (request.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (!isAgreedCancelTarget(reservation)) return 'closed';
  return 'requested';
}

/** 손님이 답할 수 없는 이유. 답할 수 있으면 null */
export function respondBlockReason(
  status: AgreedCancelRequestStatus,
): 'REQUEST_EXPIRED' | 'ALREADY_RESPONDED' | 'RESERVATION_CHANGED' | null {
  if (status === 'expired') return 'REQUEST_EXPIRED';
  if (status === 'agreed' || status === 'declined') return 'ALREADY_RESPONDED';
  if (status === 'closed') return 'RESERVATION_CHANGED';
  return null;
}
