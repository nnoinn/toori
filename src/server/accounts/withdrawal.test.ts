// 회원 탈퇴·되살리기 함수(#154). 누가 부를 수 있는지, 막는 이유가 있으면 막는지, 탈퇴 처리를 어떤 차례로 하는지 본다.
// 되살리기는 아직 가짜 결과 버전이라 배포 주소(스위치 꺼짐)에서 성공을 돌려주지 않는지, 로컬 스위치를 켜면 화면이 쓸 모양을 주는지 본다.
// 로그인·DB는 가짜로 바꿔서 DB 없이 돈다. 막는 이유를 실제로 어떻게 세는지는 withdrawal-store.db.test.ts,
// 탈퇴 처리 저장은 withdrawal-apply-store.db.test.ts가 본다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';

import type { CustomerWithdrawalFacts, OwnerWithdrawalFacts } from './withdrawal-rules';

const NOW = new Date('2026-11-23T03:00:00.000Z');

const state = vi.hoisted(() => ({
  customer: null as unknown,
  owner: null as unknown,
  account: null as unknown,
  customerFacts: null as unknown,
  /** 원장님 막는 이유 읽기가 차례로 돌려줄 값(마지막 값을 계속 쓴다) */
  ownerFacts: [] as unknown[],
  reads: [] as unknown[],
  /** 잠근 계정(이미 탈퇴했으면 null) */
  lockedCustomer: null as unknown,
  lockedOwner: null as unknown,
  /** 탈퇴 처리 저장과 로그아웃을 부른 차례 */
  calls: [] as unknown[],
  rolledBack: false,
  signOutResult: null as unknown,
}));

vi.mock('@/lib/request-time', () => ({
  getRequestNow: async () => new Date('2026-11-23T03:00:00.000Z'),
}));
vi.mock('@/db', () => ({
  getDb: () => ({
    // 트랜잭션 안에서 던지면 되돌린 것으로 본다(실제 DB 트랜잭션처럼 오류를 다시 던진다)
    transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      try {
        return await run('tx');
      } catch (error) {
        state.rolledBack = true;
        throw error;
      }
    },
  }),
}));
vi.mock('@/server/auth', () => ({
  AUTH_ERRORS: {
    UNAUTHENTICATED: '로그인이 필요해요',
    NO_CUSTOMER_ACCOUNT: '약관 동의 후 이용할 수 있어요',
    NO_OWNER_ACCOUNT: '원장님 가입을 먼저 해 주세요',
  },
  requireCustomer: async () => state.customer,
  requireOwner: async () => state.owner,
  getCurrentAccount: async () => state.account,
}));
vi.mock('@/server/auth/session', () => ({
  signOut: async () => {
    state.calls.push('signOut');
    return state.signOutResult;
  },
}));
vi.mock('./withdrawal-store', () => ({
  readCustomerWithdrawalFacts: async (_db: unknown, customerId: string, now: Date) => {
    state.reads.push(['customer', customerId, now]);
    return state.customerFacts;
  },
  readOwnerWithdrawalFacts: async (_db: unknown, shopId: string, now: Date) => {
    state.reads.push(['owner', shopId, now]);
    return state.ownerFacts.length > 1 ? state.ownerFacts.shift() : state.ownerFacts[0];
  },
}));
vi.mock('./withdrawal-apply-store', () => ({
  lockActiveCustomer: async (tx: unknown, customerId: string) => {
    state.calls.push(['lockActiveCustomer', tx, customerId]);
    return state.lockedCustomer;
  },
  lockActiveOwnerShop: async (tx: unknown, input: unknown) => {
    state.calls.push(['lockActiveOwnerShop', tx, input]);
    return state.lockedOwner;
  },
  applyCustomerWithdrawal: async (tx: unknown, input: unknown) => {
    state.calls.push(['applyCustomerWithdrawal', tx, input]);
    return { forfeitedCouponCount: 2 };
  },
  closeShopOpenSlots: async (tx: unknown, input: unknown) => {
    state.calls.push(['closeShopOpenSlots', tx, input]);
    return 4;
  },
  applyOwnerWithdrawal: async (tx: unknown, input: unknown) => {
    state.calls.push(['applyOwnerWithdrawal', tx, input]);
  },
  fillIdentityHash: async (tx: unknown, input: { userId: string; identityHash: string }) => {
    state.calls.push(['fillIdentityHash', tx, input.userId, input.identityHash.length]);
  },
}));

const {
  getCustomerWithdrawalCheck,
  getOwnerWithdrawalCheck,
  getRestorableAccount,
  restoreCustomer,
  restoreOwner,
  withdrawCustomer,
  withdrawOwner,
} = await import('./withdrawal');

const CLEAR_CUSTOMER: CustomerWithdrawalFacts = {
  upcomingReservations: 0,
  visitPendingReservations: 0,
  openDisputes: 0,
  unusedCoupons: 2,
  holding: true,
};

const CLEAR_OWNER: OwnerWithdrawalFacts = {
  upcomingReservations: 0,
  heldByCustomer: 0,
  visitPendingReservations: 0,
  openDisputes: 0,
  unpaidSettlement: null,
  outstandingPenalty: 0,
  openSlotCount: 4,
};

beforeEach(() => {
  state.customer = ok({ userId: 'user-c', customerId: 'customer-1' });
  state.owner = ok({ userId: 'user-o', ownerId: 'owner-1', shopId: 'shop-1' });
  state.account = { userId: 'user-c', mode: 'customer' };
  state.customerFacts = CLEAR_CUSTOMER;
  state.ownerFacts = [CLEAR_OWNER];
  state.reads = [];
  state.lockedCustomer = { userId: 'user-c', email: 'c@test.invalid' };
  state.lockedOwner = { userId: 'user-o', email: 'o@test.invalid', shopStatus: 'approved' };
  state.calls = [];
  state.rolledBack = false;
  state.signOutResult = ok(null);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** 로컬 개발에서 가짜 스위치를 켠다 */
function switchOn(mode: 'on' | 'blocked', failure?: string) {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('DEV_FAKE_WITHDRAWAL', mode);
  if (failure) vi.stubEnv('DEV_FAKE_WITHDRAWAL_FAILURE', failure);
}

describe('탈퇴 확인', () => {
  it('고객: 지금 고객 계정으로 세고, 막는 이유·없어질 쿠폰 수·결제 중·되살리기 기간(30일)을 준다', async () => {
    state.customerFacts = { ...CLEAR_CUSTOMER, upcomingReservations: 1 };
    expect(await getCustomerWithdrawalCheck()).toEqual(
      ok({
        blockers: [{ code: 'UPCOMING_RESERVATION', count: 1 }],
        unusedCouponCount: 2,
        holding: true,
        restoreDays: 30,
      }),
    );
    expect(state.reads).toEqual([['customer', 'customer-1', NOW]]);
  });

  it('원장님: 지금 원장님 계정의 샵으로 세고, 일괄 마감할 매물 수를 준다', async () => {
    expect(await getOwnerWithdrawalCheck()).toEqual(
      ok({ blockers: [], openSlotCount: 4, restoreDays: 30 }),
    );
    expect(state.reads).toEqual([['owner', 'shop-1', NOW]]);
  });

  it('계정 확인에 막히면 그 실패를 그대로 주고 읽지 않는다', async () => {
    state.customer = fail('WRONG_MODE', '고객 계정으로 바꿔서 이용해 주세요');
    state.owner = fail('NO_OWNER_ACCOUNT', '원장님 가입을 먼저 해 주세요');
    expect(await getCustomerWithdrawalCheck()).toMatchObject({
      ok: false,
      error: { code: 'WRONG_MODE' },
    });
    expect(await withdrawOwner()).toMatchObject({ ok: false, error: { code: 'NO_OWNER_ACCOUNT' } });
    expect(state.reads).toEqual([]);
  });

  it('blocked 스위치: 그 계정 종류의 막는 이유를 모두 준다(화면 확인용)', async () => {
    switchOn('blocked');
    const customer = await getCustomerWithdrawalCheck();
    const owner = await getOwnerWithdrawalCheck();
    expect(customer.ok && customer.data.blockers.map((blocker) => blocker.code)).toEqual([
      'UPCOMING_RESERVATION',
      'VISIT_PENDING',
      'OPEN_DISPUTE',
    ]);
    expect(owner.ok && owner.data.blockers.map((blocker) => blocker.code)).toEqual([
      'UPCOMING_RESERVATION',
      'HELD_BY_CUSTOMER',
      'VISIT_PENDING',
      'OPEN_DISPUTE',
      'UNPAID_SETTLEMENT',
      'UNPAID_PENALTY',
    ]);
  });
});

describe('탈퇴 처리', () => {
  const WITHDRAWN = {
    withdrawnAt: '2026-11-23T03:00:00.000Z',
    restorableUntil: '2026-12-23T03:00:00.000Z',
  };

  it('고객: 트랜잭션에서 계정 줄을 잠그고 막는 이유를 다시 센 뒤 처리하고, 같은 사람 표시를 채우고 로그아웃한다', async () => {
    expect(await withdrawCustomer()).toEqual(ok(WITHDRAWN));
    expect(state.reads).toEqual([['customer', 'customer-1', NOW]]);
    expect(state.calls).toEqual([
      ['lockActiveCustomer', 'tx', 'customer-1'],
      ['applyCustomerWithdrawal', 'tx', { customerId: 'customer-1', userId: 'user-c', now: NOW }],
      // 같은 사람 표시는 HMAC-SHA256 16진수(64자)
      ['fillIdentityHash', 'tx', 'user-c', 64],
      'signOut',
    ]);
  });

  it('원장님: 판매 전 매물을 일괄 마감한 뒤 막는 이유를 다시 세고, 마감한 수와 탈퇴 전 샵 상태로 처리한다', async () => {
    expect(await withdrawOwner()).toEqual(ok({ ...WITHDRAWN, closedSlotCount: 4 }));
    expect(state.reads).toEqual([
      ['owner', 'shop-1', NOW],
      ['owner', 'shop-1', NOW],
    ]);
    expect(state.calls).toEqual([
      ['lockActiveOwnerShop', 'tx', { ownerId: 'owner-1', shopId: 'shop-1' }],
      ['closeShopOpenSlots', 'tx', { shopId: 'shop-1', now: NOW }],
      [
        'applyOwnerWithdrawal',
        'tx',
        {
          ownerId: 'owner-1',
          shopId: 'shop-1',
          userId: 'user-o',
          shopStatusBefore: 'approved',
          closedSlotCount: 4,
          now: NOW,
        },
      ],
      ['fillIdentityHash', 'tx', 'user-o', 64],
      'signOut',
    ]);
  });

  it('막는 이유가 있으면 WITHDRAWAL_BLOCKED와 이유를 모두 주고, 아무것도 바꾸지 않고 로그아웃하지 않는다', async () => {
    state.ownerFacts = [{ ...CLEAR_OWNER, outstandingPenalty: 5000, openDisputes: 1 }];
    state.customerFacts = { ...CLEAR_CUSTOMER, visitPendingReservations: 1 };
    expect(await withdrawOwner()).toEqual({
      ok: false,
      error: {
        code: 'WITHDRAWAL_BLOCKED',
        message: '지금은 탈퇴할 수 없어요. 아래 이유를 확인해 주세요',
        blockers: [
          { code: 'OPEN_DISPUTE', count: 1 },
          { code: 'UNPAID_PENALTY', amount: 5000 },
        ],
      },
    });
    expect(await withdrawCustomer()).toMatchObject({
      ok: false,
      error: { code: 'WITHDRAWAL_BLOCKED', blockers: [{ code: 'VISIT_PENDING', count: 1 }] },
    });
    expect(state.calls).toEqual([
      ['lockActiveOwnerShop', 'tx', { ownerId: 'owner-1', shopId: 'shop-1' }],
      ['lockActiveCustomer', 'tx', 'customer-1'],
    ]);
  });

  it('원장님: 일괄 마감하는 사이 손님이 결제를 시작했으면 마감까지 되돌리고 WITHDRAWAL_BLOCKED', async () => {
    state.ownerFacts = [CLEAR_OWNER, { ...CLEAR_OWNER, heldByCustomer: 1 }];
    expect(await withdrawOwner()).toEqual({
      ok: false,
      error: {
        code: 'WITHDRAWAL_BLOCKED',
        message: '지금은 탈퇴할 수 없어요. 아래 이유를 확인해 주세요',
        blockers: [{ code: 'HELD_BY_CUSTOMER', count: 1 }],
      },
    });
    expect(state.rolledBack).toBe(true);
    expect(state.calls).toEqual([
      ['lockActiveOwnerShop', 'tx', { ownerId: 'owner-1', shopId: 'shop-1' }],
      ['closeShopOpenSlots', 'tx', { shopId: 'shop-1', now: NOW }],
    ]);
  });

  it('잠글 때 이미 탈퇴한 계정이면(동시에 두 번 누름) 계정이 없다고 하고 처리하지 않는다', async () => {
    state.lockedCustomer = null;
    state.lockedOwner = null;
    expect(await withdrawCustomer()).toMatchObject({
      ok: false,
      error: { code: 'NO_CUSTOMER_ACCOUNT' },
    });
    expect(await withdrawOwner()).toMatchObject({ ok: false, error: { code: 'NO_OWNER_ACCOUNT' } });
    expect(state.reads).toEqual([]);
    expect(state.calls).toHaveLength(2);
  });

  it('같은 사람 표시 키가 없으면 운영 배포는 NOT_READY(아무것도 바꾸지 않음), 로컬·미리보기는 표시 없이 탈퇴하고 경고한다', async () => {
    vi.stubEnv('ACCOUNT_IDENTITY_KEY', '');
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(await withdrawCustomer()).toEqual({
      ok: false,
      error: { code: 'NOT_READY', message: '지금은 탈퇴할 수 없어요. 잠시 후 다시 시도해 주세요' },
    });
    expect(await withdrawOwner()).toMatchObject({ ok: false, error: { code: 'NOT_READY' } });
    expect(state.calls).toEqual([
      ['lockActiveCustomer', 'tx', 'customer-1'],
      ['lockActiveOwnerShop', 'tx', { ownerId: 'owner-1', shopId: 'shop-1' }],
    ]);

    state.calls = [];
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(await withdrawCustomer()).toEqual(ok(WITHDRAWN));
    expect(state.calls).toEqual([
      ['lockActiveCustomer', 'tx', 'customer-1'],
      ['applyCustomerWithdrawal', 'tx', { customerId: 'customer-1', userId: 'user-c', now: NOW }],
      'signOut',
    ]);
    expect(console.warn).toHaveBeenCalled();
  });

  it('로그아웃이 실패해도 탈퇴는 끝났으므로 성공을 주고 오류 코드만 남긴다', async () => {
    state.signOutResult = fail('SIGN_OUT_FAILED', '로그아웃하지 못했어요');
    expect(await withdrawCustomer()).toEqual(ok(WITHDRAWN));
    expect(console.error).toHaveBeenCalledWith(
      '[withdrawal] 탈퇴 뒤 로그아웃 실패:',
      'SIGN_OUT_FAILED',
    );
  });

  it('blocked 스위치(로컬만): 탈퇴 처리도 그 계정 종류의 막는 이유를 모두 주고 잠그지도 않는다', async () => {
    switchOn('blocked');
    const customer = await withdrawCustomer();
    expect(!customer.ok && customer.error.blockers?.map((blocker) => blocker.code)).toEqual([
      'UPCOMING_RESERVATION',
      'VISIT_PENDING',
      'OPEN_DISPUTE',
    ]);
    expect(await withdrawOwner()).toMatchObject({
      ok: false,
      error: { code: 'WITHDRAWAL_BLOCKED' },
    });
    expect(state.calls).toEqual([]);

    // 로컬 개발이 아니면 스위치 값이 있어도 진짜로 처리한다
    vi.stubEnv('NODE_ENV', 'production');
    expect(await withdrawCustomer()).toEqual(ok(WITHDRAWN));
  });
});

describe('되살리기', () => {
  it('로그인하지 않았으면 UNAUTHENTICATED', async () => {
    state.account = null;
    expect(await getRestorableAccount('customer')).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
    expect(await restoreOwner()).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
  });

  it('계정 종류 값이 틀리면 INVALID_INPUT', async () => {
    expect(await getRestorableAccount('admin' as 'customer')).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    });
  });

  it('스위치 꺼짐: 되살릴 계정이 없고(null), 되살리기는 NOT_OPEN', async () => {
    expect(await getRestorableAccount('customer')).toEqual(ok(null));
    expect(await restoreCustomer()).toMatchObject({ ok: false, error: { code: 'NOT_OPEN' } });
  });

  it('스위치 켬: 3일 전에 탈퇴한 계정(27일 남음)이 보이고 되살리기는 성공 모양', async () => {
    switchOn('on');
    expect(await getRestorableAccount('owner')).toEqual(
      ok({
        withdrawnAt: '2026-11-20T03:00:00.000Z',
        restorableUntil: '2026-12-20T03:00:00.000Z',
      }),
    );
    expect(await restoreOwner()).toEqual(ok({ restoredAt: '2026-11-23T03:00:00.000Z' }));
  });

  it('실패 스위치로 기한 지남·탈퇴 계정 없음 화면을 볼 수 있다', async () => {
    switchOn('on', 'restoreCustomer:RESTORE_EXPIRED');
    expect(await restoreCustomer()).toEqual({
      ok: false,
      error: {
        code: 'RESTORE_EXPIRED',
        message: '탈퇴한 지 30일이 지나 되살릴 수 없어요. 새로 가입해 주세요',
      },
    });
    // 다른 함수에는 영향이 없다
    expect(await restoreOwner()).toEqual(ok({ restoredAt: '2026-11-23T03:00:00.000Z' }));
  });
});
