// 웹 푸시 구독 저장(upsertPushSubscription, deletePushSubscription)을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { pushSubscriptions } from '@/db/schema';

import { createTestUser } from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import { deletePushSubscription, upsertPushSubscription } from './subscription-store';

const endpoint = () => `https://push.test.invalid/${crypto.randomUUID()}`;

const rowsOf = (tx: TestTx, value: string) =>
  tx.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, value));

describeDb('웹 푸시 구독 저장 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('구독을 계정 종류·키·기기 정보와 함께 저장한다', async () => {
    await withRollback(async (tx) => {
      const userId = await createTestUser(tx);
      const value = endpoint();
      await upsertPushSubscription(tx, {
        userId,
        accountType: 'customer',
        endpoint: value,
        p256dh: 'key-1',
        auth: 'auth-1',
        userAgent: 'iPhone',
      });
      expect(await rowsOf(tx, value)).toMatchObject([
        { userId, accountType: 'customer', p256dh: 'key-1', auth: 'auth-1', userAgent: 'iPhone' },
      ]);
    });
  });

  it('같은 기기로 다시 구독하면 한 줄로 덮어쓴다(다른 계정 종류·다른 사람이어도)', async () => {
    await withRollback(async (tx) => {
      const first = await createTestUser(tx);
      const second = await createTestUser(tx);
      const value = endpoint();
      const base = { endpoint: value, p256dh: 'key-1', auth: 'auth-1', userAgent: null };
      await upsertPushSubscription(tx, { ...base, userId: first, accountType: 'customer' });
      await upsertPushSubscription(tx, {
        ...base,
        userId: first,
        accountType: 'owner',
        p256dh: 'key-2',
      });
      expect(await rowsOf(tx, value)).toMatchObject([
        { userId: first, accountType: 'owner', p256dh: 'key-2' },
      ]);
      await upsertPushSubscription(tx, { ...base, userId: second, accountType: 'customer' });
      expect(await rowsOf(tx, value)).toMatchObject([{ userId: second, accountType: 'customer' }]);
    });
  });

  it('지우기는 내 구독만', async () => {
    await withRollback(async (tx) => {
      const me = await createTestUser(tx);
      const other = await createTestUser(tx);
      const value = endpoint();
      await upsertPushSubscription(tx, {
        userId: me,
        accountType: 'customer',
        endpoint: value,
        p256dh: 'k',
        auth: 'a',
        userAgent: null,
      });
      expect(await deletePushSubscription(tx, { userId: other, endpoint: value })).toBe(false);
      expect(await rowsOf(tx, value)).toHaveLength(1);
      expect(await deletePushSubscription(tx, { userId: me, endpoint: value })).toBe(true);
      expect(await rowsOf(tx, value)).toHaveLength(0);
    });
  });
});
