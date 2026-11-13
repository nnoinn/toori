// 이의제기 접수(고객)와 운영자 처리(A-104)의 실패 코드와 화면 문구 (연결 #20, #299, #350). 화면은 error.message를 그대로 보여주고, 코드로 다음 행동을 고른다.
// 화면과 서버 어디서나 가져올 수 있다.

import type { ResultError } from '@/lib/result';
import { DISPUTE_CONTENT_LIMIT } from '@/server/policy/dispute';

export const DISPUTE_ERRORS = {
  /** 종류가 없거나 이 예약에서 고를 수 없는 종류 */
  INVALID_INPUT: '이의제기 종류를 골라 주세요',
  /** 내용이 빈칸(공백만 있는 것 포함, 11/13 nnoinn) */
  DISPUTE_CONTENT_REQUIRED: '내용을 적어 주세요',
  /** 내용이 안전 상한을 넘음(화면은 그 전에 입력을 멈춘다) */
  DISPUTE_CONTENT_TOO_LONG: `${DISPUTE_CONTENT_LIMIT.toLocaleString('ko-KR')}자까지 쓸 수 있어요`,
  /** 없는 예약이거나 내 예약이 아님 */
  RESERVATION_NOT_FOUND: '예약을 찾을 수 없어요',
  /** 예정 예약의 서비스 시작 전 */
  NOT_OPEN_YET: '서비스가 시작된 뒤에 접수할 수 있어요',
  /** 접수 기한이 지남. deadline을 같이 준다 */
  DEADLINE_PASSED: '접수 기한이 지났어요. 카카오톡 채널로 문의해 주세요',
  /** 이 예약에 이미 접수함(한 예약에 한 번, Q3) */
  ALREADY_SUBMITTED: '이미 접수한 예약이에요. 이어지는 내용은 카카오톡 채널로 보내 주세요',

  // ── 운영자(A-104, W19 ②) ──
  /** 카카오톡 채널 건 등록: 이 예약에 이미 이의제기가 있다(앱 접수 포함). disputeId로 그 기록에서 이어서 처리한다 */
  DISPUTE_EXISTS: '이미 이의제기가 있는 예약이에요. 그 기록에서 이어서 처리해 주세요',
  /** 카카오톡 채널 건 등록: 접수 기한이 지난 뒤에 받은 문의(11/12 결정, 일반 문의로 응대). deadline을 같이 준다 */
  RECEIVED_AFTER_DEADLINE:
    '접수 기한이 지난 뒤에 받은 문의라 등록하지 않아요. 카카오톡 채널에서 일반 문의로 응대해 주세요',
  /** 카카오톡 채널 건 등록: 받은 시각이 시각 모양이 아니거나 지금보다 뒤 */
  RECEIVED_AT_INVALID: '채널에서 받은 시각을 확인해 주세요',
  /** 결론 기록: 없는 이의제기 */
  DISPUTE_NOT_FOUND: '이의제기를 찾을 수 없어요',
  /** 결론 기록: 이미 결론을 기록함 */
  ALREADY_RESOLVED: '이미 결론을 기록한 이의제기예요',
  /** 결론 기록: 돈이 오가는 결론(환불 예외·무효·원장님 귀책 취소)은 처리 기능이 준비 중(#350 리뷰) */
  OUTCOME_NOT_READY: '이 결론은 처리 기능을 준비 중이에요. 확인 중으로 두고 기다려 주세요',
  /** 결론 기록: 노쇼 확정·노쇼 취소를 노쇼가 아닌 예약에 고름 */
  OUTCOME_NOT_ALLOWED: '노쇼로 처리된 예약에서만 고를 수 있는 결론이에요',
  /** 결론 기록: 메모(사유)가 비었음 */
  MEMO_REQUIRED: '결론 메모를 적어 주세요',
} as const;

export type DisputeErrorCode = keyof typeof DISPUTE_ERRORS;

export type DisputeError = ResultError & {
  /** DEADLINE_PASSED·RECEIVED_AFTER_DEADLINE: 지난 접수 기한(ISO) */
  deadline?: string;
  /** DISPUTE_EXISTS: 이미 있는 이의제기 */
  disputeId?: string;
};

export type DisputeResult<T> = { ok: true; data: T } | { ok: false; error: DisputeError };

export function disputeFail(
  code: DisputeErrorCode,
  extra: Omit<DisputeError, 'code' | 'message'> = {},
): { ok: false; error: DisputeError } {
  return { ok: false, error: { code, message: DISPUTE_ERRORS[code], ...extra } };
}
