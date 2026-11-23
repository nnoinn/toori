// 로그아웃 뒤 다시 로그인하면 푸시 알림을 되살리는 규칙(11/23 nnoinn): 기억 읽기, 되살릴지 버릴지, 서버 답 뒤에 남길지.

import { describe, expect, it } from 'vitest';

import { fail, ok } from '@/lib/result';

import {
  keepPushRestore,
  parsePushRestore,
  PUSH_RESTORE_DAYS,
  type PushRestoreMemory,
  pushRestoreAction,
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
