// 지금 들어온 사람 확인. 가짜 로그인은 next dev·시드 계정에서만 켜지는지(DB 없이),
// loadAccount가 DB에서 계정·샵을 맞게 읽는지(실제 DB, TEST_DATABASE_URL이 있을 때만) 확인한다.

import { eq } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { customers, owners, profiles } from '@/db/schema';

import { createTestCustomer, createTestShop, createTestUser } from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../tests/db/test-db';
import { getCurrentAccount, loadAccount } from './current-account';

const db = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock('@/db', () => db);
vi.mock('next/server', () => ({ connection: async () => {} }));

describe('getCurrentAccount의 가짜 로그인 (W2 전 임시)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    db.getDb.mockReset();
  });

  it('next dev가 아니면(배포·미리보기·테스트) 늘 로그인 안 함이고 DB도 보지 않는다', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEV_LOGIN_EMAIL', 'owner-a@seed.test');
    expect(await getCurrentAccount()).toBeNull();
    expect(db.getDb).not.toHaveBeenCalled();
  });

  it('next dev여도 시드 계정이 아니거나 비어 있으면 로그인 안 함이다', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_LOGIN_EMAIL', 'someone@example.com');
    expect(await getCurrentAccount()).toBeNull();
    vi.stubEnv('DEV_LOGIN_EMAIL', '');
    expect(await getCurrentAccount()).toBeNull();
    expect(db.getDb).not.toHaveBeenCalled();
  });
});

describeDb('loadAccount (실제 DB)', () => {
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
});
