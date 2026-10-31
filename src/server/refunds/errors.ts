// 환불 미리보기·예약 취소의 실패 코드와 화면 문구 (연결 #9, #128). 화면은 error.message를 그대로 보여주고, 코드로 다음 행동을 고른다.
// 화면과 서버 어디서나 가져올 수 있다.

import type { ResultError } from '@/lib/result';
import { NON_REFUNDABLE_WITHIN_HOURS } from '@/server/policy/slot-time';

import type { RefundPreview } from './types';

export const REFUND_ERRORS = {
  INVALID_INPUT: '입력한 내용을 다시 확인해 주세요',
  /** 없는 예약이거나 내 예약이 아님 */
  RESERVATION_NOT_FOUND: '예약을 찾을 수 없어요',
  ALREADY_CANCELLED: '이미 취소된 예약이에요',
  /** 시작까지 6시간 미만·시작 뒤·이용 완료. 취소 자체를 막는다(10/29 결정) */
  NOT_REFUNDABLE: `서비스 시작 ${NON_REFUNDABLE_WITHIN_HOURS}시간 전부터는 취소할 수 없어요`,
  /** 미리보기를 본 뒤 구간이 바뀜. 새 미리보기를 같이 준다 */
  REFUND_CHANGED: '환불 금액이 바뀌었어요. 바뀐 금액을 확인하고 다시 취소해 주세요',
  /** 결제사 환불이 실패함. 예약은 그대로다 */
  REFUND_FAILED: '환불하지 못했어요. 예약은 그대로예요. 잠시 후 다시 시도해 주세요',
} as const;

export type RefundErrorCode = keyof typeof REFUND_ERRORS;

export type RefundError = ResultError & {
  /** REFUND_CHANGED: 바뀐 금액으로 다시 계산한 미리보기 */
  preview?: RefundPreview;
};

export type RefundResult<T> = { ok: true; data: T } | { ok: false; error: RefundError };

export function refundFail(
  code: RefundErrorCode,
  extra: Omit<RefundError, 'code' | 'message'> = {},
): { ok: false; error: RefundError } {
  return { ok: false, error: { code, message: REFUND_ERRORS[code], ...extra } };
}
