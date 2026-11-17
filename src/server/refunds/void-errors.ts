// 예약 무효(A-108, #423)의 실패 코드와 화면 문구. 화면은 error.message를 그대로 보여준다. 화면과 서버 어디서나 가져올 수 있다.

import type { ResultError } from '@/lib/result';
import { ADMIN_REASON_LIMIT } from '@/server/policy/admin';

export const VOID_ERRORS = {
  /** 원장님 요청 내용이 빈칸(공백만 포함) */
  REASON_REQUIRED: '원장님이 요청한 내용을 적어 주세요',
  /** 원장님 요청 내용이 상한을 넘음(화면은 그 전에 입력을 멈춘다) */
  REASON_TOO_LONG: `요청 내용은 ${ADMIN_REASON_LIMIT.toLocaleString('ko-KR')}자까지 쓸 수 있어요`,
  /** 없는 예약 */
  RESERVATION_NOT_FOUND: '예약을 찾을 수 없어요',
  /** 이미 무효로 한 예약 */
  ALREADY_VOIDED: '이미 무효로 처리한 예약이에요',
  /** 정산에 묶인 예약(11/15 nnoinn: 묶이기 전까지만 무효로 한다) */
  SETTLEMENT_BUNDLED: '이미 정산에 묶인 예약이라 무효로 할 수 없어요',
  /** 다른 취소 환불이 진행 중(고객 취소·합의 후 취소·원장님 귀책 취소) */
  CANCEL_IN_PROGRESS: '진행 중인 취소가 있어요. 취소가 끝난 뒤에 다시 시도해 주세요',
  /** 포트원 환불 결과를 기다림. 정리 작업이 마무리한다 */
  VOID_FINISHING: '환불 결과를 기다리고 있어요. 잠시 뒤 정리 작업이 무효 처리를 마무리해요',
  /** 포트원이 환불하지 않음(돌아간 돈이 없다). 예약은 그대로다 */
  REFUND_FAILED: '환불하지 못했어요. 예약은 그대로예요. 잠시 후 다시 시도해 주세요',
} as const;

export type VoidErrorCode = keyof typeof VOID_ERRORS;

export type VoidResult<T> = { ok: true; data: T } | { ok: false; error: ResultError };

export function voidFail(code: VoidErrorCode): { ok: false; error: ResultError } {
  return { ok: false, error: { code, message: VOID_ERRORS[code] } };
}
