// 계정 이력 함수(#374, AUTH-13). 누가 누구의 이력을 볼 수 있는지와 열람 기록을 본다.
// 로그인·DB·열람 기록은 가짜로 바꿔서 DB 없이 돈다. 실제로 어떤 일을 읽는지는 history-store.db.test.ts가 본다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';

import type { AccountHistoryEvent } from './history-types';

const OWNER_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const CUSTOMER_ID = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';

const state = vi.hoisted(() => ({
  owner: null as unknown,
  admin: null as unknown,
  shopIdOf: null as string | null,
  userIdOf: null as string | null,
  ownerReads: [] as unknown[],
  customerReads: [] as unknown[],
  accessLogs: [] as unknown[],
}));

vi.mock('@/lib/request-time', () => ({
  getRequestNow: async () => new Date('2026-11-14T03:00:00.000Z'),
}));
vi.mock('@/db', () => ({ getDb: () => 'db' }));
vi.mock('@/server/auth', () => ({
  requireOwner: async () => state.owner,
  requireAdmin: async () => state.admin,
}));
vi.mock('@/server/admin/access-log', () => ({
  recordAdminAccess: async (adminId: string, access: unknown) => {
    state.accessLogs.push([adminId, access]);
  },
}));
vi.mock('./history-store', () => ({
  readOwnerShopId: async () => state.shopIdOf,
  readCustomerUserId: async () => state.userIdOf,
  readOwnerHistory: async (_db: unknown, input: unknown) => {
    state.ownerReads.push(input);
    return [[sample('shop_applied', '2026-10-01T00:00:00.000Z')]];
  },
  readCustomerHistory: async (_db: unknown, input: unknown) => {
    state.customerReads.push(input);
    return [[sample('signed_up', '2026-10-02T00:00:00.000Z')]];
  },
}));

const { getAdminAccountHistory, getOwnerAccountHistory } = await import('./history');

function sample(kind: AccountHistoryEvent['kind'], at: string): AccountHistoryEvent {
  return {
    key: `${kind}:1`,
    at,
    kind,
    reservationId: null,
    reservationCode: null,
    menuName: null,
    startAt: null,
    amount: null,
    rate: null,
    hoursBeforeStart: null,
    reason: null,
    result: null,
  };
}

beforeEach(() => {
  state.owner = ok({ userId: 'owner-user', ownerId: OWNER_ID, shopId: 'shop-mine' });
  state.admin = ok({ userId: 'admin-user' });
  state.shopIdOf = 'shop-of-owner';
  state.userIdOf = 'customer-user';
  state.ownerReads = [];
  state.customerReads = [];
  state.accessLogs = [];
});

describe('원장님 계정 이력', () => {
  it('지금 들어온 원장님 계정의 샵 이력만 읽는다', async () => {
    const result = await getOwnerAccountHistory({ limit: 10 });
    expect(result).toEqual(
      ok({ events: [sample('shop_applied', '2026-10-01T00:00:00.000Z')], nextBefore: null }),
    );
    expect(state.ownerReads).toEqual([
      {
        shopId: 'shop-mine',
        before: null,
        from: null,
        limit: 10,
        now: new Date('2026-11-14T03:00:00.000Z'),
      },
    ]);
  });

  it('원장님이 아니면 그 실패를 그대로, before 모양이 틀리면 INVALID_INPUT', async () => {
    state.owner = fail('WRONG_MODE', '원장님 계정으로 들어와 주세요');
    expect(await getOwnerAccountHistory()).toEqual(
      fail('WRONG_MODE', '원장님 계정으로 들어와 주세요'),
    );
    state.owner = ok({ userId: 'owner-user', ownerId: OWNER_ID, shopId: 'shop-mine' });
    expect(await getOwnerAccountHistory({ before: '어제' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    });
    expect(state.ownerReads).toEqual([]);
  });
});

describe('운영자 계정 이력 (AUTH-13)', () => {
  it('원장님 이력: 그 원장님의 샵 이력을 읽고, 열람 기록을 남긴다', async () => {
    const result = await getAdminAccountHistory({
      accountType: 'owner',
      accountId: OWNER_ID,
      before: '2026-11-13T00:00:00.000Z',
    });
    expect(result.ok).toBe(true);
    expect(state.accessLogs).toEqual([
      [
        'admin-user',
        {
          action: 'view',
          targetType: 'owner',
          targetId: OWNER_ID,
          path: `/admin/users/owners/${OWNER_ID}/history`,
        },
      ],
    ]);
    expect(state.ownerReads).toEqual([
      {
        shopId: 'shop-of-owner',
        before: new Date('2026-11-13T00:00:00.000Z'),
        from: null,
        limit: 30,
        now: new Date('2026-11-14T03:00:00.000Z'),
      },
    ]);
  });

  it('고객 이력: 그 고객의 이력을 읽고, 열람 기록을 남긴다', async () => {
    const result = await getAdminAccountHistory({
      accountType: 'customer',
      accountId: CUSTOMER_ID,
    });
    expect(result).toEqual(
      ok({ events: [sample('signed_up', '2026-10-02T00:00:00.000Z')], nextBefore: null }),
    );
    expect(state.customerReads).toEqual([
      { customerId: CUSTOMER_ID, userId: 'customer-user', before: null, from: null, limit: 30 },
    ]);
    expect(state.accessLogs).toHaveLength(1);
  });

  it('운영자가 아니면 읽지도 기록하지도 않는다', async () => {
    state.admin = fail('FORBIDDEN', '권한이 없어요');
    expect(
      await getAdminAccountHistory({ accountType: 'customer', accountId: CUSTOMER_ID }),
    ).toEqual(fail('FORBIDDEN', '권한이 없어요'));
    expect(state.customerReads).toEqual([]);
    expect(state.accessLogs).toEqual([]);
  });

  it('계정 id 모양이 틀리거나 없는 계정이면 ACCOUNT_NOT_FOUND이고 열람 기록을 남기지 않는다', async () => {
    expect(await getAdminAccountHistory({ accountType: 'owner', accountId: 'nope' })).toMatchObject(
      {
        ok: false,
        error: { code: 'ACCOUNT_NOT_FOUND' },
      },
    );
    state.shopIdOf = null;
    expect(
      await getAdminAccountHistory({ accountType: 'owner', accountId: OWNER_ID }),
    ).toMatchObject({
      ok: false,
      error: { code: 'ACCOUNT_NOT_FOUND' },
    });
    expect(state.accessLogs).toEqual([]);
  });

  it('계정 종류가 틀리면 INVALID_INPUT', async () => {
    expect(
      await getAdminAccountHistory({
        accountType: 'admin' as 'owner',
        accountId: OWNER_ID,
      }),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });
});
