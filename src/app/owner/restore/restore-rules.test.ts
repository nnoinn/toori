// 원장님 계정 되살리기 화면의 주소·문구·결과 (#154 3장). 기댓값의 근거는 #154 본문 3장(30일 되살리기, 새 가입 불가)과
// #572 함수 모양(getRestorableAccount·restoreOwner, RESTORE_EXPIRED·NOT_WITHDRAWN)

import { describe, expect, it } from 'vitest';

import { withdrawalFail } from '@/server/accounts/withdrawal-errors';

import {
  afterRestore,
  ownerEntryRedirect,
  restoreDates,
  restoreDescription,
} from './restore-rules';

const RESTORABLE = {
  withdrawnAt: '2026-11-21T05:00:00.000Z',
  restorableUntil: '2026-12-21T05:00:00.000Z',
};
const NEW_OWNER = { mode: 'owner', ownerId: null };
const OWNER = { mode: 'owner', ownerId: 'owner-1' };
const CUSTOMER_MODE = { mode: 'customer', ownerId: null };

describe('ownerEntryRedirect', () => {
  it('로그인하지 않았거나 원장님 모드가 아니면 원장님 로그인으로(돌아올 곳은 그 화면)', () => {
    expect(ownerEntryRedirect('restore', null, null)).toBe(
      '/login?mode=owner&next=%2Fowner%2Frestore',
    );
    expect(ownerEntryRedirect('restore', CUSTOMER_MODE, RESTORABLE)).toBe(
      '/login?mode=owner&next=%2Fowner%2Frestore',
    );
    expect(ownerEntryRedirect('join', null, null)).toBe('/login?mode=owner&next=%2Fowner%2Fjoin');
    expect(ownerEntryRedirect('join', CUSTOMER_MODE, null)).toBe(
      '/login?mode=owner&next=%2Fowner%2Fjoin',
    );
  });

  it('이미 원장님 계정이 있으면 두 화면 모두 원장님 화면으로', () => {
    expect(ownerEntryRedirect('join', OWNER, null)).toBe('/owner');
    expect(ownerEntryRedirect('restore', OWNER, null)).toBe('/owner');
    expect(ownerEntryRedirect('restore', OWNER, RESTORABLE)).toBe('/owner');
  });

  it('30일 안에 탈퇴한 계정이 있으면 가입 화면은 되살리기 화면으로 보내고(새 가입 불가), 되살리기 화면은 보여 준다', () => {
    expect(ownerEntryRedirect('join', NEW_OWNER, RESTORABLE)).toBe('/owner/restore');
    expect(ownerEntryRedirect('restore', NEW_OWNER, RESTORABLE)).toBeNull();
  });

  it('되살릴 계정이 없으면 가입 화면은 보여 주고, 되살리기 화면은 가입 화면으로 보낸다', () => {
    expect(ownerEntryRedirect('join', NEW_OWNER, null)).toBeNull();
    expect(ownerEntryRedirect('restore', NEW_OWNER, null)).toBe('/owner/join');
  });
});

describe('restoreDescription', () => {
  it('#154 3장 원문에 정책값 기간을 넣는다', () => {
    expect(restoreDescription(30)).toBe(
      '탈퇴한 지 30일이 지나지 않아 새 계정을 만들 수 없어요. 탈퇴한 계정을 되살릴 수 있어요',
    );
    expect(restoreDescription(14)).toContain('14일이');
  });
});

describe('restoreDates', () => {
  it('탈퇴한 날과 되살릴 수 있는 기한을 한국 시각으로', () => {
    expect(restoreDates(RESTORABLE)).toEqual({
      withdrawnAt: '11/21(토) 14:00',
      until: '12/21(월) 14:00까지',
    });
  });
});

describe('afterRestore', () => {
  it('되살리면 done', () => {
    expect(afterRestore({ ok: true, data: { restoredAt: '2026-11-24T05:00:00.000Z' } })).toEqual({
      kind: 'done',
    });
  });

  it('기한이 지났으면 expired(받은 문구)', () => {
    expect(afterRestore(withdrawalFail('RESTORE_EXPIRED'))).toEqual({
      kind: 'expired',
      message: '탈퇴한 지 30일이 지나 되살릴 수 없어요. 새로 가입해 주세요',
    });
  });

  it('되살릴 계정이 없으면 gone(받은 문구)', () => {
    expect(afterRestore(withdrawalFail('NOT_WITHDRAWN'))).toEqual({
      kind: 'gone',
      message: '되살릴 탈퇴 계정이 없어요',
    });
  });

  it('그 밖의 실패는 받은 문구(예: 같은 사람 표시 키가 없으면 NOT_READY)', () => {
    expect(afterRestore(withdrawalFail('NOT_READY'))).toEqual({
      kind: 'error',
      message: '지금은 탈퇴할 수 없어요. 잠시 후 다시 시도해 주세요',
    });
  });
});
