// 로그아웃 뒤 다시 로그인하면 푸시 알림을 되살리는 규칙(11/23 nnoinn): 기억 읽기, 되살릴지 버릴지, 서버 답 뒤에 남길지.
// 회원 탈퇴 때 이 기기 푸시 알림 순서(11/24 nnoinn).

import { describe, expect, it } from 'vitest';

import { fail, ok } from '@/lib/result';

import {
  keepPushRestore,
  parsePushRestore,
  PUSH_RESTORE_DAYS,
  type PushRestoreMemory,
  pushRestoreAction,
  withdrawWithPushCleanup,
  withoutAccountType,
} from './push-restore';

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123';
const SAVED_AT = Date.parse('2026-11-23T00:00:00Z');
const MEMORY: PushRestoreMemory = {
  userId: '9d2b1f3c-1111-4222-8333-444455556666',
  endpoint: ENDPOINT,
  accountTypes: ['customer', 'owner'],
  savedAt: SAVED_AT,
};
const DAY_MS = 24 * 60 * 60 * 1000;

describe('parsePushRestore: 기억 읽기', () => {
  it('저장한 모양 그대로 읽는다', () => {
    expect(parsePushRestore(JSON.stringify(MEMORY))).toEqual(MEMORY);
  });

  it('모르는 계정 종류는 빼고 같은 것은 한 번만. 되살릴 계정이 없으면 null', () => {
    expect(
      parsePushRestore(JSON.stringify({ ...MEMORY, accountTypes: ['owner', 'admin', 'owner'] })),
    ).toEqual({ ...MEMORY, accountTypes: ['owner'] });
    expect(parsePushRestore(JSON.stringify({ ...MEMORY, accountTypes: ['admin'] }))).toBeNull();
    expect(parsePushRestore(JSON.stringify({ ...MEMORY, accountTypes: [] }))).toBeNull();
  });

  it('없거나 모양이 틀리면 null', () => {
    expect(parsePushRestore(null)).toBeNull();
    expect(parsePushRestore('not json')).toBeNull();
    expect(parsePushRestore('[]')).toBeNull();
    expect(parsePushRestore(JSON.stringify({ ...MEMORY, userId: '' }))).toBeNull();
    expect(parsePushRestore(JSON.stringify({ ...MEMORY, endpoint: 3 }))).toBeNull();
    expect(parsePushRestore(JSON.stringify({ ...MEMORY, savedAt: 'yesterday' }))).toBeNull();
    expect(parsePushRestore(JSON.stringify({ ...MEMORY, accountTypes: 'owner' }))).toBeNull();
  });
});

describe('pushRestoreAction: 로그인한 화면이 열렸을 때', () => {
  const env = { now: SAVED_AT + DAY_MS, permission: 'granted' as const, endpoint: ENDPOINT };

  it('알림 허용과 이 기기의 브라우저 구독이 그대로면 되살린다', () => {
    expect(pushRestoreAction(MEMORY, env)).toBe('restore');
  });

  it(`${PUSH_RESTORE_DAYS}일까지는 되살리고, 지나면 버린다`, () => {
    expect(pushRestoreAction(MEMORY, { ...env, now: SAVED_AT + PUSH_RESTORE_DAYS * DAY_MS })).toBe(
      'restore',
    );
    expect(
      pushRestoreAction(MEMORY, { ...env, now: SAVED_AT + PUSH_RESTORE_DAYS * DAY_MS + 1 }),
    ).toBe('clear');
  });

  it('알림 허용이 풀렸거나(막음·다시 묻기·지원 안 함) 브라우저 구독이 없거나 바뀌었으면 버린다', () => {
    for (const permission of ['denied', 'default', 'unsupported'] as const) {
      expect(pushRestoreAction(MEMORY, { ...env, permission })).toBe('clear');
    }
    expect(pushRestoreAction(MEMORY, { ...env, endpoint: null })).toBe('clear');
    expect(pushRestoreAction(MEMORY, { ...env, endpoint: `${ENDPOINT}-new` })).toBe('clear');
  });
});

describe('keepPushRestore: 서버 답을 받은 뒤', () => {
  it('로그인하지 않은 화면이면 남겨서 로그인한 뒤 다시 한다', () => {
    expect(keepPushRestore(fail('UNAUTHENTICATED', '로그인이 필요해요'))).toBe(true);
  });

  it('되살렸거나, 같은 사람인데 되살릴 계정이 없거나, 다른 사람이 로그인했거나, 입력이 틀리면 버린다', () => {
    expect(keepPushRestore(ok({ sameUser: true, restored: ['customer'] }))).toBe(false);
    expect(keepPushRestore(ok({ sameUser: true, restored: [] }))).toBe(false);
    expect(keepPushRestore(ok({ sameUser: false, restored: [] }))).toBe(false);
    expect(keepPushRestore(fail('INVALID_INPUT', '요청을 확인하지 못했어요'))).toBe(false);
  });
});

describe('withoutAccountType: 탈퇴한 계정을 기억에서 빼기', () => {
  it('탈퇴한 계정만 빼고 나머지 계정은 남긴다', () => {
    expect(withoutAccountType(MEMORY, 'owner')).toEqual({ ...MEMORY, accountTypes: ['customer'] });
    expect(withoutAccountType(MEMORY, 'customer')).toEqual({ ...MEMORY, accountTypes: ['owner'] });
  });

  it('남는 계정이 없으면 null(기억을 버린다)', () => {
    expect(withoutAccountType({ ...MEMORY, accountTypes: ['owner'] }, 'owner')).toBeNull();
  });
});

describe('withdrawWithPushCleanup: 회원 탈퇴의 이 기기 푸시 알림 순서', () => {
  function fakeDevice() {
    const calls: string[] = [];
    const device = {
      clear: async () => {
        calls.push('clear');
      },
      forget: () => {
        calls.push('forget');
      },
      restore: async () => {
        calls.push('restore');
      },
    };
    return { calls, device };
  }

  it('탈퇴하기 전에 이 기기 구독을 지우고, 탈퇴했으면 탈퇴한 계정을 기억에서 뺀다(되살리지 않는다)', async () => {
    const { calls, device } = fakeDevice();
    const done = { ok: true };
    const result = await withdrawWithPushCleanup(async () => {
      calls.push('withdraw');
      return done;
    }, device);
    expect(result).toBe(done);
    expect(calls).toEqual(['clear', 'withdraw', 'forget']);
  });

  it('탈퇴하지 못했으면(막힘·실패) 방금 지운 구독을 되살리고 받은 결과를 그대로 돌려준다', async () => {
    const { calls, device } = fakeDevice();
    const blocked = { ok: false, error: { code: 'WITHDRAWAL_BLOCKED' } };
    const result = await withdrawWithPushCleanup(async () => {
      calls.push('withdraw');
      return blocked;
    }, device);
    expect(result).toBe(blocked);
    expect(calls).toEqual(['clear', 'withdraw', 'restore']);
  });

  it('탈퇴 중 오류가 나도 방금 지운 구독을 되살리고 그 오류를 그대로 던진다', async () => {
    const { calls, device } = fakeDevice();
    const error = new Error('network');
    await expect(
      withdrawWithPushCleanup(async () => {
        calls.push('withdraw');
        throw error;
      }, device),
    ).rejects.toBe(error);
    expect(calls).toEqual(['clear', 'withdraw', 'restore']);
  });
});
