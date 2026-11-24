import { describe, expect, it } from 'vitest';

import { WITHDRAWAL_ERRORS } from '@/server/accounts/withdrawal-errors';

import { afterCheck, afterWithdraw, withdrawalNotices } from './withdrawal-steps';

// 기댓값 출처: #154 본문(10/29 nnoinn) 1장 막는 조건·"쿠폰 N장이 없어져요", 2장 탈퇴하면 바로, 3장 30일 되살리기,
// 기술 가이드 7장 "회원 탈퇴 공통"(막히면 이유를 모두, 아니면 확인 창 두 번). 막는 이유 문구는 강규민 withdrawalBlockerText 그대로
const NO_BLOCKERS = { blockers: [], unusedCouponCount: 0, holding: false, restoreDays: 30 };

describe('[회원 탈퇴]를 누른 뒤(C-106)', () => {
  it('막는 이유가 있으면 모두, 받은 순서대로 고객 문구로 보여 준다', () => {
    expect(
      afterCheck(
        {
          ok: true,
          data: {
            ...NO_BLOCKERS,
            unusedCouponCount: 2,
            blockers: [
              { code: 'UPCOMING_RESERVATION', count: 2 },
              { code: 'VISIT_PENDING', count: 1 },
              { code: 'OPEN_DISPUTE', count: 1 },
            ],
          },
        },
        false,
      ),
    ).toEqual({
      kind: 'blocked',
      reasons: [
        '이용 예정인 예약이 2건 있어요. 이용하거나 취소한 뒤 탈퇴할 수 있어요',
        '방문 확인 중인 예약이 1건 있어요. 원장님이 방문을 확인한 뒤 탈퇴할 수 있어요',
        '확인 중인 이의제기가 1건 있어요. 결론이 난 뒤 탈퇴할 수 있어요',
      ],
    });
  });

  it('막는 이유가 없으면 첫째 확인 창(탈퇴하면 이렇게 돼요)', () => {
    expect(afterCheck({ ok: true, data: NO_BLOCKERS }, false)).toEqual({
      kind: 'notice',
      lines: [
        '관심 동네·찜한 샵·푸시 알림·광고성 알림 동의가 지워져요',
        '30일 안에 같은 로그인으로 들어오면 계정을 되살릴 수 있어요. 그동안은 새로 가입할 수 없어요',
      ],
    });
  });

  it('확인하지 못하면 받은 문구(로그인이 풀렸을 때 등)', () => {
    expect(
      afterCheck(
        { ok: false, error: { code: 'UNAUTHENTICATED', message: '로그인해 주세요' } },
        false,
      ),
    ).toEqual({ kind: 'error', message: '로그인해 주세요' });
  });
});

describe('첫째 확인 창 문구(#154 1~3장)', () => {
  it('안 쓴 쿠폰이 있으면 "쿠폰 N장이 없어져요", 결제 중이면 그만둔다, 원장님 계정은 그대로', () => {
    expect(
      withdrawalNotices({ unusedCouponCount: 3, holding: true, restoreDays: 30 }, true),
    ).toEqual([
      '쿠폰 3장이 없어져요. 계정을 되살려도 돌아오지 않아요',
      '결제 중인 매물은 결제를 그만둬요',
      '관심 동네·찜한 샵·푸시 알림·광고성 알림 동의가 지워져요',
      '30일 안에 같은 로그인으로 들어오면 계정을 되살릴 수 있어요. 그동안은 새로 가입할 수 없어요',
      '원장님 계정은 그대로예요',
    ]);
  });

  it('쿠폰 1장도 보여 주고, 되살리기 기간은 받은 값(정책값)으로', () => {
    const lines = withdrawalNotices(
      { unusedCouponCount: 1, holding: false, restoreDays: 14 },
      false,
    );
    expect(lines[0]).toBe('쿠폰 1장이 없어져요. 계정을 되살려도 돌아오지 않아요');
    expect(lines).toContain(
      '14일 안에 같은 로그인으로 들어오면 계정을 되살릴 수 있어요. 그동안은 새로 가입할 수 없어요',
    );
    expect(lines).not.toContain('결제 중인 매물은 결제를 그만둬요');
    expect(lines).not.toContain('원장님 계정은 그대로예요');
  });
});

describe('[탈퇴하기]를 누른 뒤', () => {
  it('성공하면 끝(첫 화면으로 간다)', () => {
    expect(
      afterWithdraw({
        ok: true,
        data: {
          withdrawnAt: '2026-11-24T05:00:00.000Z',
          restorableUntil: '2026-12-24T05:00:00.000Z',
        },
      }),
    ).toEqual({ kind: 'done' });
  });

  it('그 사이 막는 이유가 생겼으면 이유 창(서버가 다시 본다)', () => {
    expect(
      afterWithdraw({
        ok: false,
        error: {
          code: 'WITHDRAWAL_BLOCKED',
          message: WITHDRAWAL_ERRORS.WITHDRAWAL_BLOCKED,
          blockers: [{ code: 'UPCOMING_RESERVATION', count: 1 }],
        },
      }),
    ).toEqual({
      kind: 'blocked',
      reasons: ['이용 예정인 예약이 1건 있어요. 이용하거나 취소한 뒤 탈퇴할 수 있어요'],
    });
  });

  it('막혔는데 이유가 오지 않았거나 다른 실패면 받은 문구', () => {
    expect(
      afterWithdraw({
        ok: false,
        error: { code: 'WITHDRAWAL_BLOCKED', message: WITHDRAWAL_ERRORS.WITHDRAWAL_BLOCKED },
      }),
    ).toEqual({ kind: 'error', message: WITHDRAWAL_ERRORS.WITHDRAWAL_BLOCKED });
    // 이유가 빈 목록이면 빈 이유 창을 열지 않는다
    expect(
      afterWithdraw({
        ok: false,
        error: {
          code: 'WITHDRAWAL_BLOCKED',
          message: WITHDRAWAL_ERRORS.WITHDRAWAL_BLOCKED,
          blockers: [],
        },
      }),
    ).toEqual({ kind: 'error', message: WITHDRAWAL_ERRORS.WITHDRAWAL_BLOCKED });
    expect(
      afterWithdraw({
        ok: false,
        error: { code: 'NOT_READY', message: WITHDRAWAL_ERRORS.NOT_READY },
      }),
    ).toEqual({ kind: 'error', message: WITHDRAWAL_ERRORS.NOT_READY });
  });
});
