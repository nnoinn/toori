// 예약 취소의 결제사 환불 (X-203, W14). 서버에서만 부른다.

import 'server-only';

import { cancelPortOnePayment, type PortOneCancel } from '@/server/payments/portone';

/** 고객 취소 때 포트원에 보내는 사유. 웹훅이 포트원 취소 내역에서 이 사유를 보고 앱이 보낸 고객 취소인지 가른다(sync-cancel.ts) */
export const CUSTOMER_CANCEL_REASON = '고객 예약 취소';

/**
 * 시드·시나리오가 만든 주문의 결제 번호 앞부분(scripts/dev-db.mjs). 포트원에 결제가 없어서 부를 수 없다.
 * 진짜 주문은 toori-로 시작해서(newPaymentId) 여기에 걸리지 않고, 모르는 번호는 포트원에 물어 실패하게 둔다
 */
const NO_PG_PAYMENT_PREFIXES = ['seed_', 'scenario_'];

/** 포트원을 부르지 않아도 되는 환불인지. 돌려줄 돈이 없거나(쿠폰 전액 결제) 시드·시나리오 주문이다 */
export function skipsPortOne(paymentId: string, refundAmount: number): boolean {
  return (
    refundAmount === 0 || NO_PG_PAYMENT_PREFIXES.some((prefix) => paymentId.startsWith(prefix))
  );
}

/** 결제액 중 환불액만 돌려준다 */
export async function refundPayment(input: {
  paymentId: string;
  paidAmount: number;
  refundAmount: number;
}): Promise<PortOneCancel> {
  const { paymentId, paidAmount, refundAmount } = input;
  if (skipsPortOne(paymentId, refundAmount)) {
    return { ok: true, cancellationId: null, amount: refundAmount };
  }
  return cancelPortOnePayment(paymentId, CUSTOMER_CANCEL_REASON, {
    amount: refundAmount,
    currentCancellableAmount: paidAmount,
  });
}
