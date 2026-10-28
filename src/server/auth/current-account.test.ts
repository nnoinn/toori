// 지금 들어온 사람 확인. 로그인 세션이 없으면 DB를 보지 않고 null인지, 프로필 이름을 맞게 읽는지(DB 없이),
// loadAccount·ensureProfile이 DB에서 계정·샵을 맞게 읽고 쓰는지(실제 DB, TEST_DATABASE_URL이 있을 때만) 확인한다.

import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { customers, owners, profiles } from '@/db/schema';

import { createTestCustomer, createTestShop, createTestUser } from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../tests/db/test-db';
import { ensureProfile, getCurrentAccount, getSessionUser, loadAccount } from './current-account';

const db = vi.hoisted(() => ({ getDb: vi.fn() }));
const session = vi.hoisted(() => ({ claims: null as Record<string, unknown> | null }));
vi.mock('@/db', () => db);
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('@/server/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getClaims: async () => ({
        data: session.claims ? { claims: session.claims } : null,
        error: null,
      }),
    },
  }),
}));

beforeEach(() => {
  session.claims = null;
});

describe('getCurrentAccount', () => {
  it('로그인 세션이 없으면 null이고 DB는 보지 않는다', async () => {
    expect(await getCurrentAccount()).toBeNull();
    expect(db.getDb).not.toHaveBeenCalled();
  });
});

describe('getSessionUser', () => {
  it('카카오·구글 프로필 이름(full_name, 없으면 name)을 앞뒤 공백 없이 읽는다', async () => {
    session.claims = { sub: 'user-1', user_metadata: { full_name: ' 김투리 ', name: '다른 이름' } };
    expect(await getSessionUser()).toEqual({ userId: 'user-1', name: '김투리' });

    session.claims = { sub: 'user-1', user_metadata: { full_name: '  ', name: '투리' } };
    expect(await getSessionUser()).toEqual({ userId: 'user-1', name: '투리' });
  });

  it('프로필 이름이 없으면 name은 null', async () => {
    session.claims = { sub: 'user-1' };
    expect(await getSessionUser()).toEqual({ userId: 'user-1', name: null });
  });
});

describeDb('loadAccount·ensureProfile (실제 DB)', () => {
  afterAll(closeTestDb);

  it('로그인 정보가 없으면 null', async () => {
    await withRollback(async (tx) => {
      expect(await loadAccount(tx, crypto.randomUUID(), 'customer')).toBeNull();
    });
  });

  it('고객 계정만 있으면 customerId만 채우고 고른 모드를 그대로 돌려준다', async () => {
    await withRollback(async (tx) => {
      const { userId, customerId } = await createTestCustomer(tx);
      expect(await loadAccount(tx, userId, 'owner')).toEqual({
        userId,
        email: `${userId}@test.invalid`,
        mode: 'owner',
        customerId,
        ownerId: null,
        shopId: null,
        isAdmin: false,
      });
    });
  });

  it('원장님이면 ownerId와 샵을 채우고, 같은 로그인 정보의 고객 계정도 같이 읽는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const [customer] = await tx
        .insert(customers)
        .values({ userId: shop.createdBy, nickname: '같은 사람' })
        .returning();
      const [owner] = await tx.select().from(owners).where(eq(owners.userId, shop.createdBy));

      const account = await loadAccount(tx, shop.createdBy, 'owner');
      expect(account).toMatchObject({
        customerId: customer.id,
        ownerId: owner.id,
        shopId: shop.shopId,
      });
    });
  });

  it('탈퇴한 원장님 계정은 없는 것으로 본다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      await tx
        .update(owners)
        .set({ withdrawnAt: new Date() })
        .where(eq(owners.userId, shop.createdBy));
      expect(await loadAccount(tx, shop.createdBy, 'owner')).toMatchObject({
        ownerId: null,
        shopId: null,
      });
    });
  });

  it('관리자 표시를 읽는다', async () => {
    await withRollback(async (tx) => {
      const userId = await createTestUser(tx);
      await tx.update(profiles).set({ isAdmin: true }).where(eq(profiles.id, userId));
      expect(await loadAccount(tx, userId, 'customer')).toMatchObject({ isAdmin: true });
    });
  });

  it('ensureProfile은 첫 로그인에만 profiles를 만들고, 다시 불러도 그대로 둔다', async () => {
    await withRollback(async (tx) => {
      const userId = await createTestUser(tx);
      // createTestUser가 이미 profiles를 만들었다. 다른 이메일로 다시 불러도 바뀌지 않는다
      await ensureProfile(tx, userId, 'changed@test.invalid');
      const [row] = await tx.select().from(profiles).where(eq(profiles.id, userId));
      expect(row.email).toBe(`${userId}@test.invalid`);
    });
  });
});
