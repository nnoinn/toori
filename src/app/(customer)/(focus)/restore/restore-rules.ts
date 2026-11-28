// 고객 계정 되살리기 화면(/restore)의 주소·문구·결과 (#154 3장, C-106). 화면은 page.tsx·restore-form.tsx.
// 탈퇴한 지 30일 안에 같은 로그인으로 고객 계정에 들어오면, 로그인 콜백이 보내는 가입 화면(/join)이 이 화면으로 보낸다
// (새 가입은 막히고 되살리기만 할 수 있다)

import { formatKst } from '@/lib/time';
import type { WithdrawalResult } from '@/server/accounts/withdrawal-errors';
import type { RestorableAccount, RestoredAccount } from '@/server/accounts/withdrawal-types';

export const RESTORE_PATH = '/restore';

/** 가입 화면이 되살리기 화면으로 보낼 주소. 되살린 뒤 돌아갈 곳(next)을 그대로 넘긴다 */
export function restorePath(next: string): string {
  return `${RESTORE_PATH}?next=${encodeURIComponent(next)}`;
}

/** 되살린 뒤 갈 곳. 로그인 콜백의 기본값 '/'(첫 화면, 계정 고르기)이면 고객 홈으로 */
export function afterRestorePath(next: string): string {
  return next === '/' ? '/home' : next;
}

export const RESTORE_TEXT = {
  title: '탈퇴한 계정이 있어요',
  restore: '계정 되살리기',
  restoring: '되살리는 중…',
  withdrawnAt: '탈퇴한 날',
  restorableUntil: '되살릴 수 있는 기한',
  join: '새로 가입하기',
  continue: '계속하기',
  failed: '되살리지 못했어요. 잠시 후 다시 시도해 주세요',
} as const;

/** 안내 문구(#154 3장 원문). 기간은 정책값(WITHDRAWAL_RESTORE_DAYS) */
export function restoreDescription(restoreDays: number): string {
  return `탈퇴한 지 ${restoreDays}일이 지나지 않아 새 계정을 만들 수 없어요. 탈퇴한 계정을 되살릴 수 있어요`;
}

/** 되살리면 돌아오는 것과 돌아오지 않는 것(#154 3장, #579) */
export const RESTORE_NOTES = [
  '예약·결제 기록은 그대로 돌아와요',
  '없어진 쿠폰, 관심 동네·관심 샵·푸시 알림·광고성 알림 동의는 돌아오지 않아요',
] as const;

/** 탈퇴한 날과 되살릴 수 있는 기한. 예: "11/21(토) 14:00" */
export function restoreDates(account: RestorableAccount): { withdrawnAt: string; until: string } {
  return {
    withdrawnAt: formatKst(new Date(account.withdrawnAt)),
    until: `${formatKst(new Date(account.restorableUntil))}까지`,
  };
}

/**
 * [계정 되살리기]를 누른 뒤.
 * - done: 되살림 → 돌아갈 곳으로
 * - expired(RESTORE_EXPIRED): 기한이 지남 → [새로 가입하기]
 * - gone(NOT_WITHDRAWN): 되살릴 계정이 없음(다른 창에서 먼저 되살렸거나 이미 계정이 있음) → [계속하기]
 * - error: 그 밖의 실패는 받은 문구 그대로, 다시 누를 수 있다
 */
export type RestoreOutcome =
  | { kind: 'done' }
  | { kind: 'expired'; message: string }
  | { kind: 'gone'; message: string }
  | { kind: 'error'; message: string };

export function afterRestore(result: WithdrawalResult<RestoredAccount>): RestoreOutcome {
  if (result.ok) return { kind: 'done' };
  const { code, message } = result.error;
  if (code === 'RESTORE_EXPIRED') return { kind: 'expired', message };
  if (code === 'NOT_WITHDRAWN') return { kind: 'gone', message };
  return { kind: 'error', message };
}
