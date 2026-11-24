// 원장님 정산 내역·정산서 함수(S-501·S-502)의 권한(docs/security-review.md 1장, X-102 "원장님은 본인 샵만").
// 다른 샵 id로 부르면 FORBIDDEN이고 아무것도 읽지 않는지, 원장님 모드가 아니면 막히는지, 내 샵이면 그 샵 id로만 읽는지 본다.
// 샵 확인 함수(requireShopOwner)는 진짜를 쓰고, 로그인한 계정과 DB 읽기만 가짜로 바꾼다(DB 없이 돈다).

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentAccount } from '@/server/auth/current-account';

const state = vi.hoisted(() => ({
  account: null as CurrentAccount | null,
  /** 불린 DB 읽기와 넘긴 샵 id */
  reads: [] as [string, unknown][],
}));

/** DB 읽기를 기록하고 빈 값을 돌려주는 가짜 */
const reader = vi.hoisted(
  () => (name: string, empty: unknown) => async (_db: unknown, input: unknown) => {
    const shopId = typeof input === 'string' ? input : (input as { shopId?: string }).shopId;
    state.reads.push([name, shopId]);
    return empty;
  },
);

vi.mock('@/server/auth/current-account', () => ({ getCurrentAccount: async () => state.account }));
vi.mock('@/server/auth', async () => ({
  requireShopOwner: (await import('@/server/auth/require')).requireShopOwner,
}));
vi.mock('@/db', () => ({ getDb: () => 'db' }));
vi.mock('@/lib/request-time', () => ({
  getRequestNow: async () => new Date('2026-11-23T03:00:00.000Z'),
}));
vi.mock('./settlement-store', () => ({
  readShopSettlementRows: reader('readShopSettlementRows', []),
  readOutstandingPenalty: reader('readOutstandingPenalty', 0),
}));
vi.mock('./statement-store', () => ({
  readShopSettlements: reader('readShopSettlements', []),
  readUnpaidPenalties: reader('readUnpaidPenalties', []),
  readLastPayoutDate: reader('readLastPayoutDate', null),
  readPayoutAccount: reader('readPayoutAccount', null),
  readPenaltyCollections: async () => [],
}));

const { getSettlementItems } = await import('./get-settlement-items');
const { getSettlementStatement, getSettlementStatements } =
  await import('./get-settlement-statements');

const MY_SHOP = 'shop-mine';
const OTHER_SHOP = 'shop-other';

function account(extra: Partial<CurrentAccount>): CurrentAccount {
  return {
    userId: 'user-1',
    email: 'owner@seed.test',
    mode: 'owner',
    customerId: null,
    ownerId: 'owner-1',
    shopId: MY_SHOP,
    isAdmin: false,
    ...extra,
  };
}

/** 세 함수를 그 샵 id로 부른다 */
const callAll = (shopId: string) =>
  Promise.all([
    getSettlementItems({ shopId, from: '2026-11-01', to: '2026-11-30' }),
    getSettlementStatements({ shopId, from: '2026-11-01', to: '2026-11-30' }),
    getSettlementStatement({ shopId, payoutDate: '2026-11-26' }),
  ]);

beforeEach(() => {
  state.account = account({});
  state.reads = [];
});

describe('원장님 정산 내역·정산서 권한', () => {
  it('원장님 A가 다른 샵 B의 id로 부르면 세 함수 모두 FORBIDDEN이고 아무것도 읽지 않는다', async () => {
    for (const result of await callAll(OTHER_SHOP)) {
      expect(result).toEqual({
        ok: false,
        error: { code: 'FORBIDDEN', message: '접근 권한이 없어요' },
      });
    }
    expect(state.reads).toEqual([]);
  });

  it('로그인하지 않았거나 고객 모드면 막고(관리자여도) 아무것도 읽지 않는다', async () => {
    state.account = null;
    for (const result of await callAll(MY_SHOP)) {
      expect(result).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
    }
    state.account = account({ mode: 'customer', isAdmin: true });
    for (const result of await callAll(MY_SHOP)) {
      expect(result).toMatchObject({ ok: false, error: { code: 'WRONG_MODE' } });
    }
    expect(state.reads).toEqual([]);
  });

  it('내 샵이면 세 함수 모두 내 샵 id로만 읽는다', async () => {
    await callAll(MY_SHOP);
    expect(state.reads.length).toBeGreaterThan(0);
    expect(new Set(state.reads.map(([, shopId]) => shopId))).toEqual(new Set([MY_SHOP]));
  });
});
