// 원장님 계정 되살리기 화면(/owner/restore)의 주소·문구·결과 (#154 3장). 화면은 page.tsx·restore-form.tsx.
// 탈퇴한 지 30일 안에 같은 로그인으로 원장님 모드에 들어오면, 로그인 콜백이 보내는 원장님 가입 화면(/owner/join)이
// 이 화면으로 보낸다(새 가입은 막히고 되살리기만 할 수 있다). 고객 되살리기(/restore, 정찬형)와 같은 순서다

import { formatKst } from '@/lib/time';
import type { WithdrawalResult } from '@/server/accounts/withdrawal-errors';
import type { RestorableAccount, RestoredAccount } from '@/server/accounts/withdrawal-types';
import { DEFAULT_NEXT, loginPath, OWNER_JOIN_PATH } from '@/server/auth/paths';

export const OWNER_RESTORE_PATH = '/owner/restore';

/** 되살린 뒤 갈 곳(원장님 대시보드) */
export const AFTER_RESTORE_PATH = DEFAULT_NEXT.owner;

/** 화면을 열 때 보는 로그인 정보(getCurrentAccount의 일부) */
export type EntryAccount = { mode: string; ownerId: string | null } | null;

/**
 * 원장님 가입(join)·되살리기(restore) 화면을 열었을 때 보낼 곳. null이면 그 화면을 보여 준다.
 * - 로그인하지 않았거나 원장님 모드가 아님 → 원장님 로그인(돌아올 곳은 그 화면)
 * - 이미 원장님 계정이 있음 → 원장님 화면
 * - 되살릴 계정이 있음 → 가입 화면은 되살리기 화면으로(30일 안에는 새 가입 불가), 되살리기 화면은 보여 준다
 * - 되살릴 계정이 없음 → 되살리기 화면은 가입 화면으로, 가입 화면은 보여 준다
 */
export function ownerEntryRedirect(
  page: 'join' | 'restore',
  account: EntryAccount,
  restorable: RestorableAccount | null,
): string | null {
  const here = page === 'join' ? OWNER_JOIN_PATH : OWNER_RESTORE_PATH;
  if (!account || account.mode !== 'owner') return loginPath('owner', here);
  if (account.ownerId) return DEFAULT_NEXT.owner;
  if (restorable) return page === 'join' ? OWNER_RESTORE_PATH : null;
  return page === 'restore' ? OWNER_JOIN_PATH : null;
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

/** 되살리면 돌아오는 것과 돌아오지 않는 것(#154 3장, #579: 샵은 탈퇴 전 상태로, 마감한 매물은 그대로) */
export const RESTORE_NOTES = [
  '샵은 탈퇴하기 전 상태로 돌아와요. 입점 승인을 받았던 샵은 바로 매물을 올릴 수 있어요',
  '탈퇴할 때 마감한 매물과 꺼진 푸시 알림은 돌아오지 않아요. 푸시 알림은 내 계정에서 다시 켜 주세요',
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
 * - done: 되살림 → 원장님 대시보드로
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
