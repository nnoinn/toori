// 푸시 구독 저장·지우기·조회 (연결 #12, #131). 지금 모드의 계정으로 다루는지, 입력 모양을 확인하는지 본다.
// 로그인·DB·요청 헤더는 가짜로 바꿔서 DB 없이 돈다. 실제 저장은 subscription-store.db.test.ts가 본다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';

const state = vi.hoisted(() => ({
  account: null as unknown,
  userAgent: 'Mozilla/5.0 (iPhone)' as string | null,
  upserts: [] as unknown[],
  deletes: [] as unknown[],
  deviceDeletes: [] as unknown[],
  lookups: [] as unknown[],
  subscribed: false,
}));

vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (name: string) => (name === 'user-agent' ? state.userAgent : null),
  }),
}));
vi.mock('@/db', () => ({
  getDb: () => ({ transaction: (run: (tx: string) => unknown) => run('tx') }),
}));
vi.mock('@/server/auth', async (importOriginal) => ({
  AUTH_ERRORS: (await importOriginal<typeof import('@/server/auth')>()).AUTH_ERRORS,
  getCurrentAccount: async () => state.account,
}));
vi.mock('./subscription-store', () => ({
  upsertPushSubscription: async (tx: unknown, input: unknown) => {
    state.upserts.push({ tx, input });
  },
  deletePushSubscription: async (_db: unknown, input: unknown) => {
    state.deletes.push(input);
    return true;
  },
  deleteDevicePushSubscriptions: async (_db: unknown, input: unknown) => {
    state.deviceDeletes.push(input);
    return 2;
  },
  hasPushSubscription: async (_db: unknown, input: unknown) => {
    state.lookups.push(input);
    return state.subscribed;
  },
}));

const {
  getPushSubscriptionStatus,
  removeDevicePushSubscriptions,
  removePushSubscription,
  savePushSubscription,
} = await import('./subscriptions');

const SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  expirationTime: null,
  keys: { p256dh: 'BPublicKeyBase64', auth: 'AuthSecret' },
};

const account = (mode: 'customer' | 'owner', extra = {}) => ({
  userId: 'user-1',
  mode,
  customerId: 'customer-1',
  ownerId: 'owner-1',
  shopId: 'shop-1',
  isAdmin: false,
  ...extra,
});

beforeEach(() => {
  state.account = account('customer');
  state.userAgent = 'Mozilla/5.0 (iPhone)';
  state.upserts = [];
  state.deletes = [];
  state.deviceDeletes = [];
  state.lookups = [];
  state.subscribed = false;
});

describe('savePushSubscription', () => {
  it.each(['customer', 'owner'] as const)(
    '%s 모드면 그 계정의 구독으로 저장하고 기기 정보를 남긴다',
    async (mode) => {
      state.account = account(mode);
      expect(await savePushSubscription(SUBSCRIPTION)).toEqual(ok(null));
      expect(state.upserts).toEqual([
        {
          tx: 'tx',
          input: {
            userId: 'user-1',
            accountType: mode,
            endpoint: SUBSCRIPTION.endpoint,
            p256dh: 'BPublicKeyBase64',
            auth: 'AuthSecret',
            userAgent: 'Mozilla/5.0 (iPhone)',
          },
        },
      ]);
    },
  );

  it('로그인하지 않았거나 지금 모드의 계정이 없으면 저장하지 않는다', async () => {
    const cases: [unknown, string][] = [
      [null, 'UNAUTHENTICATED'],
      [account('customer', { customerId: null }), 'NO_CUSTOMER_ACCOUNT'],
      [account('owner', { ownerId: null }), 'NO_OWNER_ACCOUNT'],
    ];
    for (const [value, code] of cases) {
      state.account = value;
      const result = await savePushSubscription(SUBSCRIPTION);
      expect(result.ok === false && result.error.code).toBe(code);
    }
    expect(state.upserts).toEqual([]);
  });

  it.each([
    ['https가 아닌 주소', { ...SUBSCRIPTION, endpoint: 'http://push.example/x' }],
    ['주소 모양이 아님', { ...SUBSCRIPTION, endpoint: 'not a url' }],
    ['키 없음', { endpoint: SUBSCRIPTION.endpoint }],
    ['빈 키', { ...SUBSCRIPTION, keys: { p256dh: '', auth: 'x' } }],
  ])('%s → INVALID_INPUT', async (_, input) => {
    const result = await savePushSubscription(input as never);
    expect(result).toEqual(
      fail('INVALID_INPUT', '알림 설정을 저장하지 못했어요. 다시 시도해 주세요'),
    );
    expect(state.upserts).toEqual([]);
  });

  it('기기 정보가 없거나 너무 길면 비우거나 자른다', async () => {
    state.userAgent = null;
    await savePushSubscription(SUBSCRIPTION);
    state.userAgent = 'x'.repeat(1000);
    await savePushSubscription(SUBSCRIPTION);
    const agents = state.upserts.map(
      (u) => (u as { input: { userAgent: string | null } }).input.userAgent,
    );
    expect(agents[0]).toBeNull();
    expect(agents[1]).toHaveLength(300);
  });
});

describe('removePushSubscription', () => {
  it.each(['customer', 'owner'] as const)('%s 모드면 그 계정의 구독만 지운다', async (mode) => {
    state.account = account(mode);
    expect(await removePushSubscription(SUBSCRIPTION.endpoint)).toEqual(ok(null));
    expect(state.deletes).toEqual([
      { userId: 'user-1', accountType: mode, endpoint: SUBSCRIPTION.endpoint },
    ]);
    expect(state.deviceDeletes).toEqual([]);
  });

  it('로그인하지 않았으면 UNAUTHENTICATED, 모양이 틀린 주소는 지우지 않고 성공', async () => {
    state.account = null;
    const result = await removePushSubscription(SUBSCRIPTION.endpoint);
    expect(result.ok === false && result.error.code).toBe('UNAUTHENTICATED');
    state.account = account('customer');
    expect(await removePushSubscription('x'.repeat(3000))).toEqual(ok(null));
    expect(state.deletes).toEqual([]);
  });
});

describe('removeDevicePushSubscriptions', () => {
  it('이 기기의 내 구독을 계정 종류와 상관없이 지운다', async () => {
    expect(await removeDevicePushSubscriptions(SUBSCRIPTION.endpoint)).toEqual(ok(null));
    expect(state.deviceDeletes).toEqual([{ userId: 'user-1', endpoint: SUBSCRIPTION.endpoint }]);
    expect(state.deletes).toEqual([]);
  });

  it('로그인하지 않았으면 UNAUTHENTICATED, 모양이 틀린 주소는 지우지 않고 성공', async () => {
    state.account = null;
    const result = await removeDevicePushSubscriptions(SUBSCRIPTION.endpoint);
    expect(result.ok === false && result.error.code).toBe('UNAUTHENTICATED');
    state.account = account('customer');
    expect(await removeDevicePushSubscriptions('not a url')).toEqual(ok(null));
    expect(state.deviceDeletes).toEqual([]);
  });
});

describe('getPushSubscriptionStatus', () => {
  it.each([
    ['customer', true],
    ['customer', false],
    ['owner', true],
    ['owner', false],
  ] as const)(
    '%s 모드에서 구독이 있는지(%s)를 지금 계정 기준으로 본다',
    async (mode, subscribed) => {
      state.account = account(mode);
      state.subscribed = subscribed;
      expect(await getPushSubscriptionStatus(SUBSCRIPTION.endpoint)).toEqual(ok({ subscribed }));
      expect(state.lookups).toEqual([
        { userId: 'user-1', accountType: mode, endpoint: SUBSCRIPTION.endpoint },
      ]);
    },
  );

  it('로그인하지 않았으면 UNAUTHENTICATED, 모양이 틀린 주소는 DB를 보지 않고 꺼짐', async () => {
    state.account = null;
    const result = await getPushSubscriptionStatus(SUBSCRIPTION.endpoint);
    expect(result.ok === false && result.error.code).toBe('UNAUTHENTICATED');
    state.account = account('customer');
    expect(await getPushSubscriptionStatus('http://push.example/x')).toEqual(
      ok({ subscribed: false }),
    );
    expect(state.lookups).toEqual([]);
  });
});
