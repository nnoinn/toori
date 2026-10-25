// 권한 확인 함수가 #47 2장의 실패 코드대로 판단하는지 확인한다. 로그인한 사람은 가짜로 넣는다(DB 없이 돈다).

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentAccount } from './current-account';
import { requireAdmin, requireCustomer, requireOwner, requireShopOwner } from './require';

const current = vi.hoisted(() => ({ account: null as CurrentAccount | null }));
vi.mock('./current-account', () => ({ getCurrentAccount: async () => current.account }));

const SHOP = 'shop-1';

function account(extra: Partial<CurrentAccount> = {}): CurrentAccount {
  return {
    userId: 'user-1',
    email: 'someone@seed.test',
    mode: 'customer',
    customerId: null,
    ownerId: null,
    shopId: null,
    isAdmin: false,
    ...extra,
  };
}

const owner = (extra: Partial<CurrentAccount> = {}) =>
  account({ mode: 'owner', ownerId: 'owner-1', shopId: SHOP, ...extra });

beforeEach(() => {
  current.account = null;
});

describe('requireCustomer', () => {
  it('로그인하지 않았으면 UNAUTHENTICATED', async () => {
    expect(await requireCustomer()).toEqual({
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: '로그인이 필요해요' },
    });
  });

  it('원장님 모드면 WRONG_MODE(고객 계정으로 바꾸라는 문구)', async () => {
    current.account = owner({ customerId: 'customer-1' });
    expect(await requireCustomer()).toEqual({
      ok: false,
      error: { code: 'WRONG_MODE', message: '고객 계정으로 바꿔서 이용해 주세요' },
    });
  });

  it('고객 모드인데 고객 계정이 없으면 NO_CUSTOMER_ACCOUNT', async () => {
    current.account = account();
    const result = await requireCustomer();
    expect(result.ok || result.error.code).toBe('NO_CUSTOMER_ACCOUNT');
  });

  it('고객 계정이 있으면 userId·customerId를 돌려준다', async () => {
    current.account = account({ customerId: 'customer-1' });
    expect(await requireCustomer()).toEqual({
      ok: true,
      data: { userId: 'user-1', customerId: 'customer-1' },
    });
  });
});

describe('requireOwner', () => {
  it('로그인하지 않았으면 UNAUTHENTICATED', async () => {
    const result = await requireOwner();
    expect(result.ok || result.error.code).toBe('UNAUTHENTICATED');
  });

  it('고객 모드면 WRONG_MODE(원장님 계정으로 들어오라는 문구)', async () => {
    current.account = account({ customerId: 'customer-1', ownerId: 'owner-1', shopId: SHOP });
    expect(await requireOwner()).toEqual({
      ok: false,
      error: { code: 'WRONG_MODE', message: '원장님 계정으로 들어와 주세요' },
    });
  });

  it('원장님 모드인데 원장님 계정이나 샵이 없으면 NO_OWNER_ACCOUNT', async () => {
    current.account = account({ mode: 'owner' });
    let result = await requireOwner();
    expect(result.ok || result.error.code).toBe('NO_OWNER_ACCOUNT');

    current.account = owner({ shopId: null });
    result = await requireOwner();
    expect(result.ok || result.error.code).toBe('NO_OWNER_ACCOUNT');
  });

  it('원장님 계정이 있으면 userId·ownerId·shopId를 돌려준다', async () => {
    current.account = owner();
    expect(await requireOwner()).toEqual({
      ok: true,
      data: { userId: 'user-1', ownerId: 'owner-1', shopId: SHOP },
    });
  });
});

describe('requireShopOwner', () => {
  it('내 샵이면 통과한다', async () => {
    current.account = owner();
    const result = await requireShopOwner(SHOP);
    expect(result.ok && result.data.shopId).toBe(SHOP);
  });

  it('다른 샵이면 FORBIDDEN', async () => {
    current.account = owner();
    expect(await requireShopOwner('shop-2')).toEqual({
      ok: false,
      error: { code: 'FORBIDDEN', message: '접근 권한이 없어요' },
    });
  });

  it('원장님 확인에서 먼저 실패하면 그 코드를 그대로 돌려준다', async () => {
    current.account = account({ customerId: 'customer-1' });
    const result = await requireShopOwner(SHOP);
    expect(result.ok || result.error.code).toBe('WRONG_MODE');
  });
});

describe('requireAdmin', () => {
  it('로그인하지 않았으면 UNAUTHENTICATED, 관리자가 아니면 FORBIDDEN', async () => {
    let result = await requireAdmin();
    expect(result.ok || result.error.code).toBe('UNAUTHENTICATED');

    current.account = owner();
    result = await requireAdmin();
    expect(result.ok || result.error.code).toBe('FORBIDDEN');
  });

  it('관리자면 계정 종류와 상관없이 통과한다', async () => {
    current.account = owner({ isAdmin: true });
    expect(await requireAdmin()).toEqual({ ok: true, data: { userId: 'user-1' } });
  });
});
