// 결제 실패 뒤 다음 행동 (J11, C-406, D12). 화면이 실패 코드로 고른다.

import type { PaymentError } from '@/server/payments/errors';

export type FailureAction = { label: string; href: string };

/**
 * - 결제창을 닫았거나 결제가 안 됐고 홀딩이 남았으면: 예약 확인으로 돌아가 남은 시간 안에 다시 결제(D12)
 * - 홀딩이 끝났으면: 그 매물 상세에서 다시 예약
 * - 자동 취소(환불)했거나 결제 정보를 못 찾으면: 홈
 */
export function failureAction(error: PaymentError): FailureAction {
  if (error.autoCancelled) return { label: '홈으로', href: '/' };
  if (error.slotId && (error.code === 'PAYMENT_CANCELLED' || error.code === 'PAYMENT_FAILED')) {
    return error.holdActive
      ? { label: '예약 확인으로 돌아가기', href: `/checkout/${error.slotId}` }
      : { label: '매물 다시 보기', href: `/slots/${error.slotId}` };
  }
  return { label: '홈으로', href: '/' };
}
