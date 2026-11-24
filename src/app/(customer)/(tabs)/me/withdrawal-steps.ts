// 고객 내 정보 > [회원 탈퇴]의 단계와 문구 (C-106, #154). 화면은 withdraw-account.tsx.
// 막는 이유가 있으면 모두 보여 주고(문구는 강규민 withdrawalBlockerText), 없으면 확인 창 두 번(알려 주기 → 정말 탈퇴할까요?) 뒤 탈퇴한다

import type { WithdrawalResult } from '@/server/accounts/withdrawal-errors';
import { withdrawalBlockerText } from '@/server/accounts/withdrawal-texts';
import type {
  CustomerWithdrawalCheck,
  WithdrawalBlocker,
  WithdrawnAccount,
} from '@/server/accounts/withdrawal-types';

export const WITHDRAWAL_TEXT = {
  button: '회원 탈퇴',
  checking: '확인하는 중…',
  blockedTitle: '지금은 탈퇴할 수 없어요',
  blockedDescription: '아래 이유가 모두 없어지면 탈퇴할 수 있어요',
  /** 고객을 막는 이유(이용 예정·방문 확인 중 예약, 이의제기)는 모두 내 예약에서 본다 */
  reservations: '내 예약 보기',
  close: '닫기',
  noticeTitle: '회원 탈퇴',
  noticeDescription: '탈퇴하기 전에 확인해 주세요',
  next: '다음',
  cancel: '취소',
  confirmTitle: '정말 탈퇴할까요?',
  confirmDescription: '탈퇴하면 바로 로그아웃돼요.',
  confirm: '탈퇴하기',
  withdrawing: '탈퇴하는 중…',
  failed: '탈퇴하지 못했어요. 잠시 후 다시 시도해 주세요',
} as const;

/** 막는 이유를 고객 문구로(받은 순서 그대로) */
export function blockerReasons(blockers: WithdrawalBlocker[]): string[] {
  return blockers.map((blocker) => withdrawalBlockerText(blocker, 'customer'));
}

/**
 * 첫째 확인 창에 보여 줄 "탈퇴하면 이렇게 돼요"(#154 본문 1~3장). 쿠폰·결제 중·원장님 계정 줄은 해당할 때만.
 * 쿠폰·관심 동네·찜·푸시 알림·광고성 동의는 되살려도 돌아오지 않는다(#154 3장, #579)
 */
export function withdrawalNotices(
  check: Pick<CustomerWithdrawalCheck, 'unusedCouponCount' | 'holding' | 'restoreDays'>,
  hasOwnerAccount: boolean,
): string[] {
  const lines: string[] = [];
  if (check.unusedCouponCount > 0) {
    lines.push(`쿠폰 ${check.unusedCouponCount}장이 없어져요. 계정을 되살려도 돌아오지 않아요`);
  }
  if (check.holding) lines.push('결제 중인 매물은 결제를 그만둬요');
  lines.push('관심 동네·찜한 샵·푸시 알림·광고성 알림 동의가 지워져요');
  lines.push(
    `${check.restoreDays}일 안에 같은 로그인으로 들어오면 계정을 되살릴 수 있어요. 그동안은 새로 가입할 수 없어요`,
  );
  if (hasOwnerAccount) lines.push('원장님 계정은 그대로예요');
  return lines;
}

/** [회원 탈퇴]를 누른 뒤: 막혔으면 이유 창, 아니면 첫째 확인 창, 실패면 문구 */
export type CheckOutcome =
  | { kind: 'blocked'; reasons: string[] }
  | { kind: 'notice'; lines: string[] }
  | { kind: 'error'; message: string };

export function afterCheck(
  result: WithdrawalResult<CustomerWithdrawalCheck>,
  hasOwnerAccount: boolean,
): CheckOutcome {
  if (!result.ok) return { kind: 'error', message: result.error.message };
  if (result.data.blockers.length > 0) {
    return { kind: 'blocked', reasons: blockerReasons(result.data.blockers) };
  }
  return { kind: 'notice', lines: withdrawalNotices(result.data, hasOwnerAccount) };
}

/** [탈퇴하기]를 누른 뒤: 성공, 그 사이 막는 이유가 생김(서버가 다시 본다), 실패 문구 */
export type WithdrawOutcome =
  { kind: 'done' } | { kind: 'blocked'; reasons: string[] } | { kind: 'error'; message: string };

export function afterWithdraw(result: WithdrawalResult<WithdrawnAccount>): WithdrawOutcome {
  if (result.ok) return { kind: 'done' };
  const { code, blockers, message } = result.error;
  if (code === 'WITHDRAWAL_BLOCKED' && blockers && blockers.length > 0) {
    return { kind: 'blocked', reasons: blockerReasons(blockers) };
  }
  return { kind: 'error', message };
}
