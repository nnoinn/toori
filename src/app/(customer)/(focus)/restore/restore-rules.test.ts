import { describe, expect, it } from 'vitest';

import { WITHDRAWAL_ERRORS } from '@/server/accounts/withdrawal-errors';
import { WITHDRAWAL_RESTORE_DAYS } from '@/server/policy/withdrawal';

import {
  afterRestore,
  afterRestorePath,
  RESTORE_NOTES,
  restoreDates,
  restoreDescription,
  restorePath,
} from './restore-rules';

// 기댓값 출처: #154 본문 3장(30일 되살리기, 안내 원문 "탈퇴한 지 30일이 지나지 않아 새 계정을 만들 수 없어요.
// 탈퇴한 계정을 되살릴 수 있어요", 되살리면 이력 그대로, 마감한 매물과 없어진 쿠폰은 돌아오지 않음),
// #579(지운 관심 동네·찜·푸시 구독, 철회한 광고성 동의도 돌아오지 않음), 함수 모양(#572: RESTORE_EXPIRED·NOT_WITHDRAWN)
describe('되살리기 화면 주소', () => {
  it('가입 화면이 돌아갈 곳(next)을 그대로 넘겨서 보낸다', () => {
    expect(restorePath('/slots/abc?from=list')).toBe('/restore?next=%2Fslots%2Fabc%3Ffrom%3Dlist');
    expect(restorePath('/')).toBe('/restore?next=%2F');
  });

  it("되살린 뒤: 첫 화면('/')이면 고객 홈, 아니면 돌아갈 곳", () => {
    expect(afterRestorePath('/')).toBe('/home');
    expect(afterRestorePath('/slots/abc')).toBe('/slots/abc');
  });
});

describe('되살리기 안내(#154 3장)', () => {
  it('안내 원문, 기간은 정책값(30일)', () => {
    expect(WITHDRAWAL_RESTORE_DAYS).toBe(30);
    expect(restoreDescription(WITHDRAWAL_RESTORE_DAYS)).toBe(
      '탈퇴한 지 30일이 지나지 않아 새 계정을 만들 수 없어요. 탈퇴한 계정을 되살릴 수 있어요',
    );
    // 정책값이 바뀌면 문구도 바뀐다
    expect(restoreDescription(14)).toBe(
      '탈퇴한 지 14일이 지나지 않아 새 계정을 만들 수 없어요. 탈퇴한 계정을 되살릴 수 있어요',
    );
  });

  it('되살리면 기록은 돌아오고, 쿠폰·관심 동네·찜·알림 설정은 돌아오지 않는다', () => {
    expect(RESTORE_NOTES).toEqual([
      '예약·결제 기록은 그대로 돌아와요',
      '없어진 쿠폰, 관심 동네·찜한 샵·푸시 알림·광고성 알림 동의는 돌아오지 않아요',
    ]);
  });

  it('탈퇴한 날과 기한은 한국 시각(요일 포함), 기한에는 "까지"', () => {
    // 2026-11-21(토) 14:00 KST에 탈퇴 → 12/21(월) 14:00 KST까지
    expect(
      restoreDates({
        withdrawnAt: '2026-11-21T05:00:00.000Z',
        restorableUntil: '2026-12-21T05:00:00.000Z',
      }),
    ).toEqual({ withdrawnAt: '11/21(토) 14:00', until: '12/21(월) 14:00까지' });
  });
});

describe('[계정 되살리기]를 누른 뒤', () => {
  it('되살리면 끝', () => {
    expect(afterRestore({ ok: true, data: { restoredAt: '2026-11-24T05:00:00.000Z' } })).toEqual({
      kind: 'done',
    });
  });

  it('기한이 지났으면 새로 가입, 되살릴 계정이 없으면 계속하기, 그 밖은 받은 문구', () => {
    expect(
      afterRestore({
        ok: false,
        error: { code: 'RESTORE_EXPIRED', message: WITHDRAWAL_ERRORS.RESTORE_EXPIRED },
      }),
    ).toEqual({
      kind: 'expired',
      message: '탈퇴한 지 30일이 지나 되살릴 수 없어요. 새로 가입해 주세요',
    });
    expect(
      afterRestore({
        ok: false,
        error: { code: 'NOT_WITHDRAWN', message: WITHDRAWAL_ERRORS.NOT_WITHDRAWN },
      }),
    ).toEqual({ kind: 'gone', message: '되살릴 탈퇴 계정이 없어요' });
    expect(
      afterRestore({
        ok: false,
        error: { code: 'NOT_READY', message: WITHDRAWAL_ERRORS.NOT_READY },
      }),
    ).toEqual({ kind: 'error', message: WITHDRAWAL_ERRORS.NOT_READY });
  });
});
