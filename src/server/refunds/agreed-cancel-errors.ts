// 합의 후 취소의 실패 코드와 화면 문구 (연결 #19, #301). 화면은 error.message를 그대로 보여주고, 코드로 다음 행동을 고른다.
// 화면과 서버 어디서나 가져올 수 있다.

import type { ResultError } from '@/lib/result';
import { AGREED_CANCEL_RESPONSE_HOURS } from '@/server/policy/refund';

import { AGREED_CANCEL_REASON_TEXT_MAX } from './agreed-cancel-types';
import { REFUND_ERRORS } from './errors';

export const AGREED_CANCEL_ERRORS = {
  /** 사유를 고르지 않았거나, 기타인데 내용이 없거나 너무 김 */
  INVALID_INPUT: `사유를 골라 주세요. 기타는 내용을 ${AGREED_CANCEL_REASON_TEXT_MAX}자 이하로 적어 주세요`,
  /** 원장님: 없는 예약이거나 내 샵 예약이 아님 */
  RESERVATION_NOT_FOUND: '예약을 찾을 수 없어요',
  /** 원장님: 예정 예약이 아님(취소됨, 방문·노쇼 처리됨) */
  NOT_REQUESTABLE: '이 예약은 합의 후 취소를 요청할 수 없어요',
  /** 원장님: 손님 답을 기다리는 요청이 있음(한 번에 하나, 11/10) */
  ALREADY_REQUESTED: `손님 답을 기다리는 요청이 있어요. 손님이 거절하거나 ${AGREED_CANCEL_RESPONSE_HOURS}시간이 지나면 다시 요청할 수 있어요`,
  /** 고객: 없는 요청이거나 내 예약의 요청이 아님 */
  REQUEST_NOT_FOUND: '요청을 찾을 수 없어요',
  /** 고객: 답할 시간이 지남 */
  REQUEST_EXPIRED: '답할 수 있는 시간이 지났어요. 예약은 그대로예요',
  /** 고객: 이미 답함(다른 창 등) */
  ALREADY_RESPONDED: '이미 답한 요청이에요',
  /** 고객: 그 사이 예약이 취소·방문·노쇼 처리됨 */
  RESERVATION_CHANGED: '예약 상태가 바뀌어서 처리할 수 없어요',
  /** 고객 동의: 환불하지 못함(예약 취소와 같은 문구) */
  REFUND_FAILED: REFUND_ERRORS.REFUND_FAILED,
  /** 고객 동의: 환불을 마무리하는 중(예약 취소와 같은 문구) */
  CANCEL_FINISHING: REFUND_ERRORS.CANCEL_FINISHING,
} as const;

export type AgreedCancelErrorCode = keyof typeof AGREED_CANCEL_ERRORS;

export type AgreedCancelResult<T> = { ok: true; data: T } | { ok: false; error: ResultError };

export function agreedCancelFail(code: AgreedCancelErrorCode): { ok: false; error: ResultError } {
  return { ok: false, error: { code, message: AGREED_CANCEL_ERRORS[code] } };
}
