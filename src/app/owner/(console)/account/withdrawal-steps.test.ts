// 원장님 [원장님 탈퇴]의 단계와 문구 (#154). 기댓값의 근거는 #154 본문 1~4장(막는 조건, 탈퇴하면 바로, 30일 되살리기, 30일 뒤)

import { describe, expect, it } from 'vitest';

import { withdrawalFail } from '@/server/accounts/withdrawal-errors';
import { withdrawalBlockerText } from '@/server/accounts/withdrawal-texts';
import type { OwnerWithdrawalCheck, WithdrawalBlocker } from '@/server/accounts/withdrawal-types';

import {
  afterCheck,
  afterWithdraw,
  blockerReasons,
  blockerShortcuts,
  confirmDescription,
  withdrawalNotices,
} from './withdrawal-steps';

const RESERVED: WithdrawalBlocker = { code: 'UPCOMING_RESERVATION', count: 2 };
const VISIT: WithdrawalBlocker = { code: 'VISIT_PENDING', count: 1 };
const DISPUTE: WithdrawalBlocker = { code: 'OPEN_DISPUTE', count: 1 };
const HELD: WithdrawalBlocker = { code: 'HELD_BY_CUSTOMER', count: 1 };
const SETTLEMENT: WithdrawalBlocker = { code: 'UNPAID_SETTLEMENT', nextPayoutDate: '2026-11-26' };
const PENALTY: WithdrawalBlocker = { code: 'UNPAID_PENALTY', amount: 3000 };

const SCHEDULE = { href: '/owner/schedule', label: '예약 현황 보기' };
const SETTLEMENTS = { href: '/owner/settlements', label: '정산 보기' };

const OPEN: OwnerWithdrawalCheck = { blockers: [], openSlotCount: 3, restoreDays: 30 };

describe('blockerReasons', () => {
  it('막는 이유를 받은 순서대로 원장님 문구로 바꾼다(고객 문구가 아니다)', () => {
    expect(blockerReasons([SETTLEMENT, RESERVED])).toEqual([
      '아직 지급하지 않은 정산금이 있어요. 11/26(목) 지급 뒤 탈퇴할 수 있어요',
      '손님이 예약한 매물이 2건 있어요. 서비스가 끝난 뒤 탈퇴할 수 있어요',
    ]);
    expect(blockerReasons([VISIT])).toEqual([withdrawalBlockerText(VISIT, 'owner')]);
    expect(blockerReasons([VISIT])).not.toEqual([withdrawalBlockerText(VISIT, 'customer')]);
  });
});

describe('blockerShortcuts', () => {
  it('예약된 매물·방문 처리 전·이의제기는 예약 현황, 미지급 정산금·패널티는 정산으로 간다', () => {
    expect(blockerShortcuts([RESERVED])).toEqual([SCHEDULE]);
    expect(blockerShortcuts([VISIT])).toEqual([SCHEDULE]);
    expect(blockerShortcuts([DISPUTE])).toEqual([SCHEDULE]);
    expect(blockerShortcuts([SETTLEMENT])).toEqual([SETTLEMENTS]);
    expect(blockerShortcuts([PENALTY])).toEqual([SETTLEMENTS]);
  });

  it('손님 결제 중은 기다리면 풀려서 바로가기가 없다', () => {
    expect(blockerShortcuts([HELD])).toEqual([]);
  });

  it('같은 화면은 한 번만, 예약 현황 → 정산 순으로 둔다', () => {
    expect(blockerShortcuts([PENALTY, RESERVED, SETTLEMENT, VISIT, HELD, DISPUTE])).toEqual([
      SCHEDULE,
      SETTLEMENTS,
    ]);
  });
});

describe('withdrawalNotices', () => {
  it('탈퇴하면 바로 하는 일, 되살리기 기간(정책값), 30일 뒤 지우는 것을 알린다', () => {
    expect(withdrawalNotices({ restoreDays: 30 }, false)).toEqual([
      '샵이 고객 화면과 지도에서 바로 보이지 않아요',
      '푸시 알림이 꺼져요',
      '30일 안에 같은 로그인으로 들어오면 계정을 되살릴 수 있어요. 그동안은 새로 가입할 수 없어요',
      '계정을 되살려도 탈퇴할 때 마감한 매물은 돌아오지 않아요',
      '30일이 지나면 샵 정보·사진·정산 계좌가 지워지고, 다시 쓰려면 가입과 입점 심사를 새로 받아야 해요',
    ]);
  });

  it('기간은 받은 값을 쓴다', () => {
    expect(withdrawalNotices({ restoreDays: 14 }, false).join('\n')).toContain('14일 안에');
    expect(withdrawalNotices({ restoreDays: 14 }, false).join('\n')).not.toContain('30일');
  });

  it('같은 로그인에 고객 계정이 있을 때만 "고객 계정은 그대로예요"를 맨 끝에 더한다', () => {
    const lines = withdrawalNotices({ restoreDays: 30 }, true);
    expect(lines.at(-1)).toBe('고객 계정은 그대로예요');
    expect(withdrawalNotices({ restoreDays: 30 }, false)).not.toContain('고객 계정은 그대로예요');
  });
});

describe('confirmDescription', () => {
  it('판매 전 매물·시간대가 있으면 몇 개를 마감하는지 알린다', () => {
    expect(confirmDescription(3)).toBe('판매 전 매물·시간대 3개를 마감하고, 바로 로그아웃돼요.');
    expect(confirmDescription(1)).toBe('판매 전 매물·시간대 1개를 마감하고, 바로 로그아웃돼요.');
  });

  it('없으면 로그아웃만 알린다', () => {
    expect(confirmDescription(0)).toBe('탈퇴하면 바로 로그아웃돼요.');
  });
});

describe('afterCheck', () => {
  it('막는 이유가 있으면 이유 창(이유 모두와 바로가기)', () => {
    const outcome = afterCheck(
      { ok: true, data: { ...OPEN, blockers: [RESERVED, PENALTY] } },
      false,
    );
    expect(outcome).toEqual({
      kind: 'blocked',
      reasons: blockerReasons([RESERVED, PENALTY]),
      shortcuts: [SCHEDULE, SETTLEMENTS],
    });
  });

  it('없으면 첫째 확인 창. 둘째 창 설명에 일괄 마감할 매물 수', () => {
    expect(afterCheck({ ok: true, data: OPEN }, true)).toEqual({
      kind: 'notice',
      lines: withdrawalNotices(OPEN, true),
      confirm: '판매 전 매물·시간대 3개를 마감하고, 바로 로그아웃돼요.',
    });
  });

  it('확인에 실패하면 받은 문구', () => {
    expect(afterCheck(withdrawalFail('NOT_READY'), false)).toEqual({
      kind: 'error',
      message: '지금은 탈퇴할 수 없어요. 잠시 후 다시 시도해 주세요',
    });
  });
});

describe('afterWithdraw', () => {
  it('탈퇴하면 done', () => {
    expect(
      afterWithdraw({
        ok: true,
        data: {
          withdrawnAt: '2026-11-24T03:00:00.000Z',
          restorableUntil: '2026-12-24T03:00:00.000Z',
          closedSlotCount: 3,
        },
      }),
    ).toEqual({ kind: 'done' });
  });

  it('그 사이 막는 이유가 생겼으면(서버가 다시 본다) 이유 창을 다시 연다', () => {
    expect(afterWithdraw(withdrawalFail('WITHDRAWAL_BLOCKED', { blockers: [HELD] }))).toEqual({
      kind: 'blocked',
      reasons: blockerReasons([HELD]),
      shortcuts: [],
    });
  });

  it('그 밖의 실패는 받은 문구(예: 같은 사람 표시 키가 없으면 NOT_READY)', () => {
    expect(afterWithdraw(withdrawalFail('NOT_READY'))).toEqual({
      kind: 'error',
      message: '지금은 탈퇴할 수 없어요. 잠시 후 다시 시도해 주세요',
    });
    expect(afterWithdraw(withdrawalFail('WITHDRAWAL_BLOCKED'))).toEqual({
      kind: 'error',
      message: '지금은 탈퇴할 수 없어요. 아래 이유를 확인해 주세요',
    });
  });
});
