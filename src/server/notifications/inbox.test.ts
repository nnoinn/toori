// 알림함 함수 (#371). 지금 계정 모드로만 열리는지(NOTI-07), 입력 확인, 다음 쪽·90일·화면 안내 겹침을 본다.
// 로그인·DB는 가짜로 바꿔서 DB 없이 돈다. 실제로 어떤 알림을 읽고 바꾸는지는 inbox-store.db.test.ts가 본다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';

import type { MyNotification } from './inbox-types';

const USER_ID = '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f';
/** 11/16 12:00(한국 시간) */
const NOW = new Date('2026-11-16T03:00:00.000Z');
/** 90일 전 */
const FROM = new Date('2026-08-18T03:00:00.000Z');

const state = vi.hoisted(() => ({
  customer: null as unknown,
  owner: null as unknown,
  rows: [] as unknown[],
  unread: 0,
  marked: 0,
  calls: [] as [string, unknown, unknown][],
}));

vi.mock('@/lib/request-time', () => ({
  getRequestNow: async () => new Date('2026-11-16T03:00:00.000Z'),
}));
vi.mock('@/db', () => ({ getDb: () => 'db' }));
vi.mock('@/server/auth', () => ({
  requireCustomer: async () => state.customer,
  requireOwner: async () => state.owner,
}));
vi.mock('./inbox-store', async (original) => ({
  ...(await original<typeof import('./inbox-store')>()),
  selectInboxPage: async (_db: unknown, owner: unknown, input: unknown) => {
    state.calls.push(['page', owner, input]);
    return state.rows;
  },
  countUnreadInbox: async (_db: unknown, owner: unknown) => {
    state.calls.push(['count', owner, null]);
    return state.unread;
  },
  markInboxRead: async (_db: unknown, owner: unknown, target: unknown, now: unknown) => {
    state.calls.push(['mark', owner, { target, now }]);
    return state.marked;
  },
  selectInboxSince: async (_db: unknown, owner: unknown, input: unknown) => {
    state.calls.push(['since', owner, input]);
    return state.rows;
  },
}));

const {
  countMyUnreadNotifications,
  listMyNotifications,
  listMyNotificationsSince,
  markNotificationsRead,
} = await import('./inbox');

function item(n: number): MyNotification {
  return {
    id: `0000000${n}-0000-4000-8000-000000000000`,
    title: `알림 ${n}`,
    body: '내용',
    url: '/reservations',
    createdAt: NOW.toISOString(),
    readAt: null,
  };
}

const CUSTOMER_INBOX = { userId: USER_ID, accountType: 'customer', from: FROM, now: NOW };
const OWNER_INBOX = { userId: USER_ID, accountType: 'owner', from: FROM, now: NOW };

beforeEach(() => {
  state.customer = ok({ userId: USER_ID, customerId: 'c-1' });
  state.owner = fail('WRONG_MODE', '원장님 계정으로 들어와 주세요');
  state.rows = [];
  state.unread = 0;
  state.marked = 0;
  state.calls = [];
});

describe('알림함 함수', () => {
  it('고객 화면은 지금 고객 계정의 최근 90일 알림을 하나 더 읽어서, 다음 쪽이 있으면 마지막 알림 id를 다음 쪽 기준으로 준다', async () => {
    state.rows = [item(1), item(2), item(3)];
    const result = await listMyNotifications({ limit: 2 });
    expect(result).toEqual(
      ok({ items: [item(1), item(2)], nextCursor: item(2).id, serverNow: NOW.toISOString() }),
    );
    expect(state.calls).toEqual([['page', CUSTOMER_INBOX, { afterId: null, limit: 3 }]]);
  });

  it('기본은 20개씩이고, 다음 쪽 기준을 넘기면 그 알림 다음부터 읽는다. 더 없으면 nextCursor는 null', async () => {
    state.rows = [item(4)];
    const result = await listMyNotifications({ cursor: item(3).id });
    expect(result).toMatchObject({ ok: true, data: { items: [item(4)], nextCursor: null } });
    expect(state.calls).toEqual([['page', CUSTOMER_INBOX, { afterId: item(3).id, limit: 21 }]]);
  });

  it('원장님 화면은 owner를 넘기고, 지금 원장님 계정일 때만 원장님 알림을 읽는다', async () => {
    state.owner = ok({ userId: USER_ID, ownerId: 'o-1', shopId: 's-1' });
    state.customer = fail('WRONG_MODE', '고객 계정으로 바꿔서 이용해 주세요');
    state.unread = 4;
    expect(await countMyUnreadNotifications('owner')).toEqual(ok(4));
    await listMyNotifications(undefined, 'owner');
    expect(state.calls).toEqual([
      ['count', OWNER_INBOX, null],
      ['page', OWNER_INBOX, { afterId: null, limit: 21 }],
    ]);
  });

  it('지금 계정이 다르면(원장님 모드에서 고객 알림함) 알림을 주지 않는다. 안 읽은 수는 null이라 종을 숨긴다', async () => {
    state.customer = fail('WRONG_MODE', '고객 계정으로 바꿔서 이용해 주세요');
    expect(await countMyUnreadNotifications()).toEqual(ok(null));
    expect(await listMyNotifications()).toMatchObject({ ok: false, error: { code: 'WRONG_MODE' } });
    expect(await markNotificationsRead({ all: true })).toMatchObject({ ok: false });
    expect(await listMyNotificationsSince(NOW.toISOString())).toMatchObject({ ok: false });
    expect(await countMyUnreadNotifications('owner')).toEqual(ok(null));
    expect(state.calls).toEqual([]);
  });

  it('로그인하지 않았으면 안 읽은 수는 null이고 나머지는 UNAUTHENTICATED다', async () => {
    state.customer = fail('UNAUTHENTICATED', '로그인이 필요해요');
    expect(await countMyUnreadNotifications()).toEqual(ok(null));
    expect(await listMyNotifications()).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
    expect(state.calls).toEqual([]);
  });

  it('틀린 입력은 INVALID_INPUT이고 DB를 읽지 않는다(다음 쪽 기준·개수·계정 종류·읽음 id·since)', async () => {
    const invalid = { ok: false, error: { code: 'INVALID_INPUT' } };
    expect(await listMyNotifications({ cursor: 'fake-01' })).toMatchObject(invalid);
    expect(await listMyNotifications({ limit: 51 })).toMatchObject(invalid);
    expect(await listMyNotifications(undefined, 'admin' as unknown as 'customer')).toMatchObject(
      invalid,
    );
    expect(await countMyUnreadNotifications('admin' as unknown as 'customer')).toMatchObject(
      invalid,
    );
    expect(await markNotificationsRead({ ids: ['fake-01'] })).toMatchObject(invalid);
    expect(await markNotificationsRead({ ids: [] })).toMatchObject(invalid);
    expect(await listMyNotificationsSince('어제')).toMatchObject(invalid);
    expect(state.calls).toEqual([]);
  });

  it('읽음은 고른 알림이나 전부를 지금 시각으로 바꾸고 바꾼 수를 준다', async () => {
    state.marked = 2;
    expect(await markNotificationsRead({ ids: [item(1).id] })).toEqual(ok({ count: 2 }));
    expect(await markNotificationsRead({ all: true })).toEqual(ok({ count: 2 }));
    expect(state.calls).toEqual([
      ['mark', CUSTOMER_INBOX, { target: { ids: [item(1).id] }, now: NOW }],
      ['mark', CUSTOMER_INBOX, { target: { all: true }, now: NOW }],
    ]);
  });

  it('화면 안내용 새 알림은 since보다 30초 앞부터 최신 20개를 읽고, 다음 since로 쓸 서버 시각을 준다', async () => {
    state.rows = [item(5)];
    const result = await listMyNotificationsSince('2026-11-16T02:59:00.000Z');
    expect(result).toEqual(ok({ items: [item(5)], serverNow: NOW.toISOString() }));
    expect(state.calls).toEqual([
      ['since', CUSTOMER_INBOX, { after: new Date('2026-11-16T02:58:30.000Z'), limit: 20 }],
    ]);
  });
});
