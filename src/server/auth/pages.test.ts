// 화면용 권한 확인이 실패 코드별로 #47 3장의 화면으로 보내는지 확인한다(DB 없이 돈다).
// next/navigation의 redirect·notFound는 보낼 주소를 담은 에러를 던지는 가짜로 바꾼다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentAccount } from './current-account';
import { ensureAdminPage, ensureCustomerPage, ensureOwnerPage } from './pages';

const current = vi.hoisted(() => ({ account: null as CurrentAccount | null }));
vi.mock('./current-account', () => ({ getCurrentAccount: async () => current.account }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
  notFound: () => {
    throw new Error('notFound');
  },
}));

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

beforeEach(() => {
  current.account = null;
});

describe('ensureOwnerPage', () => {
  it('로그인하지 않았으면 원장님 토글로 로그인 화면에 보내고, 돌아올 주소를 붙인다', async () => {
    await expect(ensureOwnerPage('/owner/slots')).rejects.toThrow(
      'redirect:/login?mode=owner&next=%2Fowner%2Fslots',
    );
  });

  it('고객 모드여도 원장님 토글로 로그인 화면에 보낸다', async () => {
    current.account = account({ customerId: 'customer-1' });
    await expect(ensureOwnerPage('/owner')).rejects.toThrow(
      'redirect:/login?mode=owner&next=%2Fowner',
    );
  });

  it('다른 사이트 주소는 돌아올 주소로 쓰지 않는다(기본 /owner)', async () => {
    await expect(ensureOwnerPage('//evil.example')).rejects.toThrow(
      'redirect:/login?mode=owner&next=%2Fowner',
    );
  });

  it('원장님 계정이 없으면 원장님 가입 화면으로 보낸다', async () => {
    current.account = account({ mode: 'owner' });
    await expect(ensureOwnerPage('/owner')).rejects.toThrow('redirect:/owner/join');
  });

  it('원장님이면 userId·ownerId·shopId를 돌려준다', async () => {
    current.account = account({ mode: 'owner', ownerId: 'owner-1', shopId: 'shop-1' });
    expect(await ensureOwnerPage('/owner')).toEqual({
      userId: 'user-1',
      ownerId: 'owner-1',
      shopId: 'shop-1',
    });
  });
});

describe('ensureCustomerPage', () => {
  it('로그인하지 않았거나 원장님 모드면 고객 토글로 로그인 화면에 보낸다', async () => {
    await expect(ensureCustomerPage('/reservations')).rejects.toThrow(
      'redirect:/login?mode=customer&next=%2Freservations',
    );

    current.account = account({ mode: 'owner', customerId: 'customer-1' });
    await expect(ensureCustomerPage('/reservations')).rejects.toThrow(
      'redirect:/login?mode=customer&next=%2Freservations',
    );
  });

  it('고객 계정이 없으면 약관 화면으로 보내고, 돌아올 주소를 붙인다', async () => {
    current.account = account();
    await expect(ensureCustomerPage('/slots/abc')).rejects.toThrow(
      'redirect:/join?next=%2Fslots%2Fabc',
    );
  });

  it('고객이면 userId·customerId를 돌려준다', async () => {
    current.account = account({ customerId: 'customer-1' });
    expect(await ensureCustomerPage('/')).toEqual({ userId: 'user-1', customerId: 'customer-1' });
  });
});

describe('ensureAdminPage', () => {
  it('관리자가 아니면 404를 보여준다', async () => {
    await expect(ensureAdminPage()).rejects.toThrow('notFound');

    current.account = account({ customerId: 'customer-1' });
    await expect(ensureAdminPage()).rejects.toThrow('notFound');
  });

  it('관리자면 userId를 돌려준다', async () => {
    current.account = account({ isAdmin: true });
    expect(await ensureAdminPage()).toEqual({ userId: 'user-1' });
  });
});
