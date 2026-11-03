// 결제 실패 뒤 다음 행동 (J11, C-406, D12). 화면이 실패 코드로 고른다.

import { CUSTOMER_HOME } from '@/server/auth/paths';
import type { PaymentError } from '@/server/payments/errors';

export type FailureAction = { label: string; href: string };

/** 결제 확인 요청이 서버에 닿지 않았을 때(인터넷 끊김 등). 화면에서만 만든다 */
export const CONFIRM_FAILED: PaymentError = {
  code: 'CONFIRM_FAILED',
  message: '결제 결과를 확인하지 못했어요. 잠시 후 다시 확인해 주세요',
};

/**
 * 결제 결과를 아직 모르는 코드(#155): 결제사가 처리 중이거나, 포트원에 묻지 못했거나, 요청이 서버에 닿지 않았다.
 * 실패가 아니라서 '다시 확인'으로 결제 확인을 다시 부른다(다시 불러도 같은 예약이라 두 번 확정되지 않는다)
 */
const RECHECK_CODES: readonly string[] = [
  'PAYMENT_PENDING',
  'PAYMENT_CHECK_UNAVAILABLE',
  CONFIRM_FAILED.code,
];

export function canRecheck(error: PaymentError): boolean {
  return RECHECK_CODES.includes(error.code);
}

/**
 * - 결제창을 닫았거나 결제가 안 됐고 홀딩이 남았으면: 예약 확인으로 돌아가 남은 시간 안에 다시 결제(D12)
 * - 홀딩이 끝났으면: 그 매물 상세에서 다시 예약
 * - 자동 취소(환불)했거나 결제 정보를 못 찾으면: 고객 홈
 */
export function failureAction(error: PaymentError): FailureAction {
  if (error.autoCancelled) return { label: '홈으로', href: CUSTOMER_HOME };
  if (error.slotId && (error.code === 'PAYMENT_CANCELLED' || error.code === 'PAYMENT_FAILED')) {
    return error.holdActive
      ? { label: '예약 확인으로 돌아가기', href: `/checkout/${error.slotId}` }
      : { label: '매물 다시 보기', href: `/slots/${error.slotId}` };
  }
  return { label: '홈으로', href: CUSTOMER_HOME };
}
