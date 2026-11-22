// 운영자 [번호 보기](#360 4번). 운영자만 받아 오고, 받아 올 때마다 열람 기록(contact_reveal)을 남기는지 본다. DB와 로그인은 가짜로 바꾼다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';

import { revealCustomerContact, revealShopOwnerContact } from './contact-actions';

const CUSTOMER = '3b1557e8-0000-4000-8000-000000000001';
const SHOP = '3b1557e8-0000-4000-8000-000000000002';
const OWNER = '3b1557e8-0000-4000-8000-000000000003';

const state = vi.hoisted(() => ({
  auth: null as unknown,
  customer: null as { email: string; phone: string | null } | null,
  owner: null as { ownerId: string; phone: string } | null,
  logs: [] as unknown[],
}));

vi.mock('@/server/auth', () => ({ requireAdmin: async () => state.auth }));
vi.mock('@/db', () => ({ getDb: () => 'db' }));
vi.mock('@/server/admin/access-log', () => ({
  recordAdminAccess: async (adminId: string, access: unknown) => {
    state.logs.push({ adminId, access });
  },
}));
vi.mock('./contact-queries', () => ({
  selectCustomerContact: async () => state.customer,
  selectShopOwnerContact: async () => state.owner,
}));

beforeEach(() => {
  state.auth = ok({ userId: 'admin-1' });
  state.customer = { email: 'abcdef@gmail.com', phone: '010-1234-5678' };
  state.owner = { ownerId: OWNER, phone: '010-9876-5432' };
  state.logs = [];
});

describe('revealCustomerContact', () => {
  it('운영자에게 고객 이메일·휴대폰 전체를 주고 열람 기록(contact_reveal)을 남긴다', async () => {
    expect(await revealCustomerContact(CUSTOMER)).toEqual(
      ok({ phone: '010-1234-5678', email: 'abcdef@gmail.com' }),
    );
    expect(state.logs).toEqual([
      {
        adminId: 'admin-1',
        access: {
          action: 'contact_reveal',
          targetType: 'customer',
          targetId: CUSTOMER,
          path: `/admin/users/customers/${CUSTOMER}`,
        },
      },
    ]);
  });

  it('운영자가 아니거나 없는 고객이면 주지 않고 기록도 남기지 않는다', async () => {
    state.auth = fail('FORBIDDEN', '운영자만 볼 수 있어요');
    expect((await revealCustomerContact(CUSTOMER)).ok).toBe(false);
    state.auth = ok({ userId: 'admin-1' });
    expect((await revealCustomerContact('not-a-uuid')).ok).toBe(false);
    state.customer = null;
    expect((await revealCustomerContact(CUSTOMER)).ok).toBe(false);
    expect(state.logs).toEqual([]);
  });
});

describe('revealShopOwnerContact', () => {
  it('입점 심사 화면의 원장님 휴대폰을 주고, 원장님을 대상으로 열람 기록을 남긴다', async () => {
    expect(await revealShopOwnerContact(SHOP)).toEqual(ok({ phone: '010-9876-5432', email: null }));
    expect(state.logs).toEqual([
      {
        adminId: 'admin-1',
        access: {
          action: 'contact_reveal',
          targetType: 'owner',
          targetId: OWNER,
          path: `/admin/shops/${SHOP}`,
        },
      },
    ]);
  });

  it('없는 샵이면 주지 않고 기록도 남기지 않는다', async () => {
    state.owner = null;
    expect((await revealShopOwnerContact(SHOP)).ok).toBe(false);
    expect(state.logs).toEqual([]);
  });
});
