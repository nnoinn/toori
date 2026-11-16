// 내 운영자 이름 정하기 (11/16 nnoinn, AUTH-14). 권한 확인과 누구 이름으로 저장하는지만 본다.
// 로그인·DB는 가짜로 바꿔서 DB 없이 돈다. 겹치는 이름·실제 저장 모양은 admin-profile.db.test.ts가 실제 DB로 본다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';

import { ADMIN_NAME_MESSAGES } from './admin-name';
import { updateMyAdminName } from './admin-profile';

const state = vi.hoisted(() => ({
  adminAuth: null as unknown,
  getDb: vi.fn(),
  inserted: [] as unknown[],
}));

vi.mock('@/server/auth', () => ({ requireAdmin: async () => state.adminAuth }));
vi.mock('@/db', () => ({ getDb: state.getDb }));

/** 겹치는 이름 찾기(select)는 takenRows를 돌려주고, 저장(insert)은 넣은 값을 모아 둔다 */
function fakeDb(takenRows: unknown[] = []) {
  const query = { from: () => query, where: () => query, limit: async () => takenRows };
  return {
    select: () => query,
    insert: () => ({
      values: (row: unknown) => {
        state.inserted.push(row);
        return { onConflictDoUpdate: async () => undefined };
      },
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.inserted = [];
  state.adminAuth = ok({ userId: 'admin-1' });
  state.getDb.mockImplementation(() => fakeDb());
});

describe('updateMyAdminName', () => {
  it('운영자가 아니면 FORBIDDEN을 그대로 돌려주고 DB를 열지 않는다', async () => {
    const forbidden = fail('FORBIDDEN', '접근 권한이 없어요');
    state.adminAuth = forbidden;
    expect(await updateMyAdminName('김투리')).toEqual(forbidden);
    expect(state.getDb).not.toHaveBeenCalled();
  });

  it('로그인하지 않았으면 UNAUTHENTICATED를 그대로 돌려주고 DB를 열지 않는다', async () => {
    const unauthenticated = fail('UNAUTHENTICATED', '로그인이 필요해요');
    state.adminAuth = unauthenticated;
    expect(await updateMyAdminName('김투리')).toEqual(unauthenticated);
    expect(state.getDb).not.toHaveBeenCalled();
  });

  it('로그인한 운영자 자기 id로, 앞뒤 공백을 뺀 이름을 저장한다', async () => {
    expect(await updateMyAdminName('  김투리 ')).toEqual(ok({ name: '김투리' }));
    expect(state.inserted).toEqual([{ userId: 'admin-1', name: '김투리' }]);
  });

  it('다른 운영자가 쓰는 이름이면 저장하지 않고 NAME_TAKEN', async () => {
    state.getDb.mockImplementation(() => fakeDb([{ userId: 'admin-2' }]));
    expect(await updateMyAdminName('김투리')).toEqual(
      fail('NAME_TAKEN', ADMIN_NAME_MESSAGES.TAKEN),
    );
    expect(state.inserted).toEqual([]);
  });

  it.each([
    ['빈 이름은', '   ', ADMIN_NAME_MESSAGES.REQUIRED],
    ["'운영자'는", '운영자', ADMIN_NAME_MESSAGES.RESERVED],
    ['글자가 아닌 값은', 42, ADMIN_NAME_MESSAGES.REQUIRED],
  ])('%s 저장하지 않고 INVALID_INPUT', async (_, input, message) => {
    expect(await updateMyAdminName(input)).toEqual(fail('INVALID_INPUT', message));
    expect(state.inserted).toEqual([]);
  });
});
