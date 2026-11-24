// 회원 탈퇴·되살리기의 실패 코드와 화면 문구 (#154). 화면은 error.message를 그대로 보여 주고, 코드로 다음 행동을 고른다.
// 화면과 서버 어디서나 가져올 수 있다. 로그인·계정 종류 실패는 AUTH_ERRORS(@/server/auth)의 코드가 그대로 온다

import type { ResultError } from '@/lib/result';
import { WITHDRAWAL_RESTORE_DAYS } from '@/server/policy/withdrawal';

import type { WithdrawalBlocker } from './withdrawal-types';

export const WITHDRAWAL_ERRORS = {
  /** 막는 이유가 있다. 오류의 blockers에 이유를 모두 준다(확인 뒤 그 사이에 생긴 경우 포함) */
  WITHDRAWAL_BLOCKED: '지금은 탈퇴할 수 없어요. 아래 이유를 확인해 주세요',
  /** 가짜 결과 버전(되살리기): 배포 주소에서는 저장하지 않아서 열지 않는다 */
  NOT_OPEN: '회원 탈퇴는 곧 열려요',
  /** 운영 배포에 같은 사람 표시 키(ACCOUNT_IDENTITY_KEY)가 없다. 아무것도 바꾸지 않았다 */
  NOT_READY: '지금은 탈퇴할 수 없어요. 잠시 후 다시 시도해 주세요',
  /** 되살리기: 그 계정 종류로 탈퇴한 계정이 없다 */
  NOT_WITHDRAWN: '되살릴 탈퇴 계정이 없어요',
  /** 되살리기: 탈퇴한 지 되살리기 기간이 지났다 */
  RESTORE_EXPIRED: `탈퇴한 지 ${WITHDRAWAL_RESTORE_DAYS}일이 지나 되살릴 수 없어요. 새로 가입해 주세요`,
  /** 계정 종류 값이 틀림(customer·owner가 아님) */
  INVALID_INPUT: '계정 종류가 올바르지 않아요',
} as const;

export type WithdrawalErrorCode = keyof typeof WITHDRAWAL_ERRORS;

/** 탈퇴 실패. 막혔으면 이유 목록이 같이 온다 */
export type WithdrawalError = ResultError & { blockers?: WithdrawalBlocker[] };

export type WithdrawalResult<T> = { ok: true; data: T } | { ok: false; error: WithdrawalError };

export function withdrawalFail(
  code: WithdrawalErrorCode,
  extra: { blockers?: WithdrawalBlocker[] } = {},
): { ok: false; error: WithdrawalError } {
  return { ok: false, error: { code, message: WITHDRAWAL_ERRORS[code], ...extra } };
}
