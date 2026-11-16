// 운영자 결제·환불 확인(#373 ①)의 실패 코드와 화면 문구. 화면은 error.message를 그대로 보여준다.
// 화면과 서버 어디서나 가져올 수 있다.

import type { ResultError } from '@/lib/result';
import { ADMIN_REASON_LIMIT } from '@/server/policy/admin';

export const PAYMENT_ISSUE_ERRORS = {
  /** 사유가 빈칸(공백만 포함) */
  REASON_REQUIRED: '사유를 적어 주세요',
  /** 사유가 상한을 넘음(화면은 그 전에 입력을 멈춘다) */
  REASON_TOO_LONG: `사유는 ${ADMIN_REASON_LIMIT.toLocaleString('ko-KR')}자까지 쓸 수 있어요`,
  /** 없는 주문 */
  ORDER_NOT_FOUND: '주문을 찾을 수 없어요',
  /** 진행 중인 취소가 없는 예약(다른 운영자나 정리 작업이 이미 끝냄) */
  CANCEL_NOT_FOUND: '끝나지 않은 환불이 없어요. 화면을 새로 고쳐 주세요',
  /** 없는 환불 기록 */
  REFUND_NOT_FOUND: '환불 기록을 찾을 수 없어요',
  /** 주문이 이미 확정·실패·자동 취소로 정리됨 */
  ALREADY_RESOLVED: '이미 정리된 주문이에요. 화면을 새로 고쳐 주세요',
  /** 정리 대상이 되기 전(결제나 취소가 아직 진행 중일 수 있음) */
  TOO_SOON: '아직 진행 중일 수 있어요. 조금 뒤에 다시 시도해 주세요',
  /** 확인할 이유가 없는 환불 */
  NO_REVIEW_NEEDED: '확인할 것이 없는 환불이에요',
  /** 이미 [확인함]을 누른 환불 */
  ALREADY_CHECKED: '이미 확인한 환불이에요. 화면을 새로 고쳐 주세요',
} as const;

export type PaymentIssueErrorCode = keyof typeof PAYMENT_ISSUE_ERRORS;

export type PaymentIssueResult<T> = { ok: true; data: T } | { ok: false; error: ResultError };

export function paymentIssueFail(code: PaymentIssueErrorCode): { ok: false; error: ResultError } {
  return { ok: false, error: { code, message: PAYMENT_ISSUE_ERRORS[code] } };
}
