// 회원 탈퇴·되살리기 함수(#154, 가짜 결과 버전). 누가 부를 수 있는지, 막는 이유가 있으면 막는지,
// 배포 주소(스위치 꺼짐)에서는 저장하지 않으면서 성공을 돌려주지 않는지, 로컬 스위치를 켜면 화면이 쓸 모양을 주는지 본다.
// 로그인·DB는 가짜로 바꿔서 DB 없이 돈다. 막는 이유를 실제로 어떻게 세는지는 withdrawal-store.db.test.ts가 본다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';

import type { CustomerWithdrawalFacts, OwnerWithdrawalFacts } from './withdrawal-rules';

const NOW = new Date('2026-11-23T03:00:00.000Z');

const state = vi.hoisted(() => ({
  customer: null as unknown,
  owner: null as unknown,
  account: null as unknown,
  customerFacts: null as unknown,
  ownerFacts: null as unknown,
  reads: [] as unknown[],
}));

vi.mock('@/lib/request-time', () => ({
  getRequestNow: async () => new Date('2026-11-23T03:00:00.000Z'),
}));
vi.mock('@/db', () => ({ getDb: () => 'db' }));
vi.mock('@/server/auth', () => ({
  AUTH_ERRORS: { UNAUTHENTICATED: '로그인이 필요해요' },
  requireCustomer: async () => state.customer,
  requireOwner: async () => state.owner,
  getCurrentAccount: async () => state.account,
}));
vi.mock('./withdrawal-store', () => ({
  readCustomerWithdrawalFacts: async (_db: unknown, customerId: string, now: Date) => {
    state.reads.push(['customer', customerId, now]);
    return state.customerFacts;
  },
  readOwnerWithdrawalFacts: async (_db: unknown, shopId: string, now: Date) => {
    state.reads.push(['owner', shopId, now]);
    return state.ownerFacts;
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
  state.ownerFacts = CLEAR_OWNER;
  state.reads = [];
});
afterEach(() => {
  vi.unstubAllEnvs();
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
  it('막는 이유가 있으면 WITHDRAWAL_BLOCKED와 이유를 모두 준다(스위치를 켜도 같다)', async () => {
    switchOn('on');
    state.ownerFacts = { ...CLEAR_OWNER, outstandingPenalty: 5000, openDisputes: 1 };
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
  });

  it('배포 주소(스위치 꺼짐)에서는 저장하지 않으므로 성공을 돌려주지 않고 NOT_OPEN', async () => {
    expect(await withdrawCustomer()).toEqual({
      ok: false,
      error: { code: 'NOT_OPEN', message: '회원 탈퇴는 곧 열려요' },
    });
    expect(await withdrawOwner()).toMatchObject({ ok: false, error: { code: 'NOT_OPEN' } });
  });

  it('로컬 스위치를 켜면 탈퇴 시각과 30일 뒤 되살리기 기한, 원장님은 일괄 마감한 매물 수를 준다', async () => {
    switchOn('on');
    expect(await withdrawCustomer()).toEqual(
      ok({
        withdrawnAt: '2026-11-23T03:00:00.000Z',
        restorableUntil: '2026-12-23T03:00:00.000Z',
      }),
    );
    expect(await withdrawOwner()).toEqual(
      ok({
        withdrawnAt: '2026-11-23T03:00:00.000Z',
        restorableUntil: '2026-12-23T03:00:00.000Z',
        closedSlotCount: 4,
      }),
    );
  });

  it('로컬 개발이 아니면 스위치 값이 있어도 켜지지 않는다', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEV_FAKE_WITHDRAWAL', 'on');
    expect(await withdrawCustomer()).toMatchObject({ ok: false, error: { code: 'NOT_OPEN' } });
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
