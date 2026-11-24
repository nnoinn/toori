// 원장님 내 계정 > [원장님 탈퇴]의 단계와 문구 (#154). 화면은 withdraw-owner.tsx.
// 막는 이유가 있으면 모두 보여 주고(문구는 강규민 withdrawalBlockerText), 없으면 확인 창 두 번(알려 주기 → 정말 탈퇴할까요?) 뒤 탈퇴한다.
// 고객 [회원 탈퇴](정찬형, (customer)/(tabs)/me/withdrawal-steps.ts)와 같은 순서다

import type { WithdrawalResult } from '@/server/accounts/withdrawal-errors';
import { withdrawalBlockerText } from '@/server/accounts/withdrawal-texts';
import type {
  OwnerWithdrawalCheck,
  WithdrawalBlocker,
  WithdrawalBlockerCode,
  WithdrawnOwnerAccount,
} from '@/server/accounts/withdrawal-types';

export const OWNER_WITHDRAWAL_TEXT = {
  button: '원장님 탈퇴',
  checking: '확인하는 중…',
  blockedTitle: '지금은 탈퇴할 수 없어요',
  blockedDescription: '아래 이유가 모두 없어지면 탈퇴할 수 있어요',
  close: '닫기',
  noticeTitle: '원장님 탈퇴',
  noticeDescription: '탈퇴하기 전에 확인해 주세요',
  next: '다음',
  cancel: '취소',
  confirmTitle: '정말 탈퇴할까요?',
  confirm: '탈퇴하기',
  withdrawing: '탈퇴하는 중…',
  failed: '탈퇴하지 못했어요. 잠시 후 다시 시도해 주세요',
} as const;

/** 막힌 이유 창의 바로가기. 이유를 없애러 가는 화면 */
export type BlockerShortcut = { href: string; label: string };

const SCHEDULE_SHORTCUT: BlockerShortcut = { href: '/owner/schedule', label: '예약 현황 보기' };
const SETTLEMENT_SHORTCUT: BlockerShortcut = { href: '/owner/settlements', label: '정산 보기' };

/**
 * 이유마다 가 볼 화면. 예약된 매물·방문 처리 전 예약·이의제기는 예약 현황(캘린더 → 예약 상세),
 * 미지급 정산금·패널티는 정산. 손님 결제 중(10분 홀딩)은 기다리면 풀려서 바로가기가 없다
 */
const SHORTCUT_BY_CODE: Record<WithdrawalBlockerCode, BlockerShortcut | null> = {
  UPCOMING_RESERVATION: SCHEDULE_SHORTCUT,
  VISIT_PENDING: SCHEDULE_SHORTCUT,
  OPEN_DISPUTE: SCHEDULE_SHORTCUT,
  UNPAID_SETTLEMENT: SETTLEMENT_SHORTCUT,
  UNPAID_PENALTY: SETTLEMENT_SHORTCUT,
  HELD_BY_CUSTOMER: null,
};

/** 막는 이유를 원장님 문구로(받은 순서 그대로) */
export function blockerReasons(blockers: WithdrawalBlocker[]): string[] {
  return blockers.map((blocker) => withdrawalBlockerText(blocker, 'owner'));
}

/** 막힌 이유 창의 바로가기(겹치지 않게, 예약 현황 → 정산 순) */
export function blockerShortcuts(blockers: WithdrawalBlocker[]): BlockerShortcut[] {
  const wanted = new Set(blockers.map((blocker) => SHORTCUT_BY_CODE[blocker.code]));
  return [SCHEDULE_SHORTCUT, SETTLEMENT_SHORTCUT].filter((shortcut) => wanted.has(shortcut));
}

/**
 * 첫째 확인 창에 보여 줄 "탈퇴하면 이렇게 돼요"(#154 본문 2~4장). 고객 계정 줄은 같은 로그인에 고객 계정이 있을 때만.
 * 일괄 마감할 매물 수는 둘째 확인 창에서 보여 준다(confirmDescription)
 */
export function withdrawalNotices(
  check: Pick<OwnerWithdrawalCheck, 'restoreDays'>,
  hasCustomerAccount: boolean,
): string[] {
  const lines = [
    '샵이 고객 화면과 지도에서 바로 보이지 않아요',
    '푸시 알림이 꺼져요',
    `${check.restoreDays}일 안에 같은 로그인으로 들어오면 계정을 되살릴 수 있어요. 그동안은 새로 가입할 수 없어요`,
    '계정을 되살려도 탈퇴할 때 마감한 매물은 돌아오지 않아요',
    `${check.restoreDays}일이 지나면 샵 정보·사진·정산 계좌가 지워지고, 다시 쓰려면 가입과 입점 심사를 새로 받아야 해요`,
  ];
  if (hasCustomerAccount) lines.push('고객 계정은 그대로예요');
  return lines;
}

/** 둘째 확인 창 설명. 판매 전 매물·시간대가 있으면 몇 개를 마감하는지 */
export function confirmDescription(openSlotCount: number): string {
  return openSlotCount > 0
    ? `판매 전 매물·시간대 ${openSlotCount}개를 마감하고, 바로 로그아웃돼요.`
    : '탈퇴하면 바로 로그아웃돼요.';
}

/** [원장님 탈퇴]를 누른 뒤: 막혔으면 이유 창, 아니면 첫째 확인 창, 실패면 문구 */
export type CheckOutcome =
  | { kind: 'blocked'; reasons: string[]; shortcuts: BlockerShortcut[] }
  | { kind: 'notice'; lines: string[]; confirm: string }
  | { kind: 'error'; message: string };

function blockedOutcome(blockers: WithdrawalBlocker[]) {
  return {
    kind: 'blocked' as const,
    reasons: blockerReasons(blockers),
    shortcuts: blockerShortcuts(blockers),
  };
}

export function afterCheck(
  result: WithdrawalResult<OwnerWithdrawalCheck>,
  hasCustomerAccount: boolean,
): CheckOutcome {
  if (!result.ok) return { kind: 'error', message: result.error.message };
  if (result.data.blockers.length > 0) return blockedOutcome(result.data.blockers);
  return {
    kind: 'notice',
    lines: withdrawalNotices(result.data, hasCustomerAccount),
    confirm: confirmDescription(result.data.openSlotCount),
  };
}

/** [탈퇴하기]를 누른 뒤: 성공, 그 사이 막는 이유가 생김(서버가 다시 본다), 실패 문구 */
export type WithdrawOutcome =
  | { kind: 'done' }
  | { kind: 'blocked'; reasons: string[]; shortcuts: BlockerShortcut[] }
  | { kind: 'error'; message: string };

export function afterWithdraw(result: WithdrawalResult<WithdrawnOwnerAccount>): WithdrawOutcome {
  if (result.ok) return { kind: 'done' };
  if (result.error.code === 'WITHDRAWAL_BLOCKED' && result.error.blockers?.length) {
    return blockedOutcome(result.error.blockers);
  }
  return { kind: 'error', message: result.error.message };
}
