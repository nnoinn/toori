// 이의제기 접수의 실패 코드와 화면 문구 (연결 #20, #299). 화면은 error.message를 그대로 보여주고, 코드로 다음 행동을 고른다.
// 화면과 서버 어디서나 가져올 수 있다.

import type { ResultError } from '@/lib/result';
import { DISPUTE_CONTENT_MAX_LENGTH, DISPUTE_CONTENT_MIN_LENGTH } from '@/server/policy/dispute';

export const DISPUTE_ERRORS = {
  /** 종류가 없거나 이 예약에서 고를 수 없는 종류, 내용 글자 수가 맞지 않음 */
  INVALID_INPUT: `종류를 고르고 내용을 ${DISPUTE_CONTENT_MIN_LENGTH}자 이상 ${DISPUTE_CONTENT_MAX_LENGTH}자 이하로 적어 주세요`,
  /** 없는 예약이거나 내 예약이 아님 */
  RESERVATION_NOT_FOUND: '예약을 찾을 수 없어요',
  /** 예정 예약의 서비스 시작 전 */
  NOT_OPEN_YET: '서비스가 시작된 뒤에 접수할 수 있어요',
  /** 접수 기한이 지남. deadline을 같이 준다 */
  DEADLINE_PASSED: '접수 기한이 지났어요. 카카오톡 채널로 문의해 주세요',
  /** 이 예약에 이미 접수함(한 예약에 한 번, Q3) */
  ALREADY_SUBMITTED: '이미 접수한 예약이에요. 이어지는 내용은 카카오톡 채널로 보내 주세요',
} as const;

export type DisputeErrorCode = keyof typeof DISPUTE_ERRORS;

export type DisputeError = ResultError & {
  /** DEADLINE_PASSED: 지난 접수 기한(ISO) */
  deadline?: string;
};

export type DisputeResult<T> = { ok: true; data: T } | { ok: false; error: DisputeError };

export function disputeFail(
  code: DisputeErrorCode,
  extra: Omit<DisputeError, 'code' | 'message'> = {},
): { ok: false; error: DisputeError } {
  return { ok: false, error: { code, message: DISPUTE_ERRORS[code], ...extra } };
}
