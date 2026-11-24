// 탈퇴 30일 뒤 개인정보 지우기(#154 본문 4장)의 차례와 실패 처리. DB 읽기·저장은 가짜로 바꾸고, 파일·로그인 정보 지우기는 가짜를 넘긴다.
// 실제로 무엇을 지우는지는 withdrawal-erase-store.db.test.ts가 본다. 같은 사람 표시는 vitest 설정의 가짜 키로 진짜 값을 만든다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { getDb } from '@/db';

import type { DueWithdrawal } from './withdrawal-erase-store';

const state = vi.hoisted(() => ({
  due: [] as unknown[],
  dueReads: [] as unknown[],
  /** 탈퇴 기록 id → 잠갔을 때 읽는 이메일(없으면 그 사이 되살렸거나 지움) */
  locked: new Map<string, { email: string | null }>(),
  ownerFiles: { businessDocPaths: [] as string[], shopImagePaths: [] as string[] },
  failErase: null as string | null,
  toForget: [] as { userId: string }[],
  calls: [] as unknown[],
  rolledBack: 0,
}));

vi.mock('./withdrawal-erase-store', () => ({
  readDueWithdrawals: async (_db: unknown, input: unknown) => {
    state.dueReads.push(input);
    return state.due;
  },
  lockDueWithdrawal: async (_tx: unknown, id: string) => state.locked.get(id) ?? null,
  eraseCustomerData: async (_tx: unknown, input: { withdrawalId: string }) => {
    if (input.withdrawalId === state.failErase) throw new TypeError('db down');
    state.calls.push(['eraseCustomerData', input]);
  },
  eraseOwnerData: async (_tx: unknown, input: { withdrawalId: string }) => {
    if (input.withdrawalId === state.failErase) throw new TypeError('db down');
    state.calls.push(['eraseOwnerData', input]);
    return state.ownerFiles;
  },
  readProfilesToForget: async () => state.toForget,
  forgetProfileEmail: async (_db: unknown, userId: string) => {
    state.calls.push(['forgetProfileEmail', userId]);
  },
}));
vi.mock('./withdrawal-apply-store', () => ({
  fillIdentityHash: async (_tx: unknown, input: { userId: string; identityHash: string }) => {
    state.calls.push(['fillIdentityHash', input.userId, input.identityHash.length]);
  },
}));

const { eraseWithdrawnAccounts } = await import('./withdrawal-erase');

const db = {
  transaction: async (run: (tx: unknown) => Promise<unknown>) => {
    try {
      return await run('tx');
    } catch (error) {
      state.rolledBack += 1;
      throw error;
    }
  },
} as unknown as ReturnType<typeof getDb>;
const NOW = new Date('2026-11-24T04:00:00.000Z');

const removed: [string, readonly string[]][] = [];
let removeFailures = 0;
const deleted: string[] = [];
let authResult: boolean | Error = true;
async function deleteAuthUser(userId: string) {
  deleted.push(userId);
  if (authResult instanceof Error) throw authResult;
  return authResult;
}
const deps = {
  removeFiles: async (bucket: string, paths: readonly string[]) => {
    removed.push([bucket, paths]);
    return paths.length > 0 ? removeFailures : 0;
  },
  deleteAuthUser,
};

function withdrawal(extra: Partial<DueWithdrawal>): DueWithdrawal {
  return {
    id: 'w-c',
    userId: 'user-c',
    accountType: 'customer',
    customerId: 'customer-1',
    ownerId: null,
    ...extra,
  };
}
const CUSTOMER = withdrawal({});
const OWNER = withdrawal({
  id: 'w-o',
  userId: 'user-o',
  accountType: 'owner',
  customerId: null,
  ownerId: 'owner-1',
});

beforeEach(() => {
  state.due = [];
  state.dueReads = [];
  state.locked = new Map([
    ['w-c', { email: 'c@test.invalid' }],
    ['w-o', { email: 'o@test.invalid' }],
  ]);
  state.ownerFiles = {
    businessDocPaths: ['users/user-o/doc.jpg'],
    shopImagePaths: ['shop-1/a.jpg', 'shop-1/b.jpg'],
  };
  state.failErase = null;
  state.toForget = [];
  state.calls = [];
  state.rolledBack = 0;
  removed.length = 0;
  removeFailures = 0;
  deleted.length = 0;
  authResult = true;
  deps.deleteAuthUser = deleteAuthUser;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('eraseWithdrawnAccounts', () => {
  it('30일 전까지 탈퇴한 기록마다 같은 사람 표시를 채우고 개인정보를 지우고, 원장님 파일은 버킷별로 지운다', async () => {
    state.due = [CUSTOMER, OWNER];
    expect(await eraseWithdrawnAccounts(db, NOW, deps)).toEqual({
      erased: 2,
      failed: 0,
      filesFailed: 0,
      forgotten: 0,
      forgetFailed: 0,
    });
    expect(state.dueReads).toEqual([{ before: new Date('2026-10-25T04:00:00.000Z'), limit: 200 }]);
    expect(state.calls).toEqual([
      ['fillIdentityHash', 'user-c', 64],
      ['eraseCustomerData', { withdrawalId: 'w-c', customerId: 'customer-1', now: NOW }],
      ['fillIdentityHash', 'user-o', 64],
      ['eraseOwnerData', { withdrawalId: 'w-o', ownerId: 'owner-1', now: NOW }],
    ]);
    expect(removed).toEqual([
      ['business-docs', []],
      ['shop-images', []],
      ['business-docs', ['users/user-o/doc.jpg']],
      ['shop-images', ['shop-1/a.jpg', 'shop-1/b.jpg']],
    ]);
  });

  it('그 사이 되살렸거나 이미 지운 기록은 건너뛰고 세지 않는다. 이메일이 없으면 같은 사람 표시는 채우지 않는다', async () => {
    state.due = [CUSTOMER, OWNER];
    state.locked = new Map([['w-o', { email: null }]]);
    expect(await eraseWithdrawnAccounts(db, NOW, deps)).toMatchObject({ erased: 1, failed: 0 });
    expect(state.calls).toEqual([
      ['eraseOwnerData', { withdrawalId: 'w-o', ownerId: 'owner-1', now: NOW }],
    ]);
  });

  it('한 건이 실패하면 그 건만 되돌리고 나머지는 지운다. 로그에는 오류 이름만 남긴다', async () => {
    state.due = [CUSTOMER, OWNER];
    state.failErase = 'w-c';
    expect(await eraseWithdrawnAccounts(db, NOW, deps)).toMatchObject({ erased: 1, failed: 1 });
    expect(state.rolledBack).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      '[withdrawal-erase] 개인정보 지우기 실패:',
      'TypeError',
    );
    expect(state.calls.at(-1)).toEqual([
      'eraseOwnerData',
      { withdrawalId: 'w-o', ownerId: 'owner-1', now: NOW },
    ]);
  });

  it('파일을 지우지 못하면 개인정보 지우기는 끝난 것으로 세고 지우지 못한 파일 수만 남긴다', async () => {
    state.due = [OWNER];
    removeFailures = 1;
    expect(await eraseWithdrawnAccounts(db, NOW, deps)).toMatchObject({
      erased: 1,
      filesFailed: 2,
    });
  });

  it('모두 탈퇴한 사람은 로그인 정보를 지운 뒤에만 이메일을 비운다. 지우지 못하면 이메일을 남겨 다음 날 다시 한다', async () => {
    state.toForget = [{ userId: 'user-a' }, { userId: 'user-b' }, { userId: 'user-c' }];
    const results: (boolean | Error)[] = [true, false, new TypeError('network')];
    deps.deleteAuthUser = async (userId: string) => {
      deleted.push(userId);
      const result = results.shift()!;
      if (result instanceof Error) throw result;
      return result;
    };
    expect(await eraseWithdrawnAccounts(db, NOW, deps)).toMatchObject({
      forgotten: 1,
      forgetFailed: 2,
    });
    expect(deleted).toEqual(['user-a', 'user-b', 'user-c']);
    expect(state.calls).toEqual([['forgetProfileEmail', 'user-a']]);
  });
});
