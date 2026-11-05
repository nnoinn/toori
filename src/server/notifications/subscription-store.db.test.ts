// 웹 푸시 구독 저장·지우기·조회를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 한 기기에 고객·원장님 구독이 하나씩 있을 수 있다(마이그레이션 0006, 11/1 결정 #131).

import { asc, eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { pushSubscriptions } from '@/db/schema';

import { createTestUser } from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import {
  deleteDevicePushSubscriptions,
  deleteExpiredPushSubscription,
  deletePushSubscription,
  hasPushSubscription,
  readPushTargets,
  upsertPushSubscription,
} from './subscription-store';

const endpoint = () => `https://push.test.invalid/${crypto.randomUUID()}`;

const rowsOf = (tx: TestTx, value: string) =>
  tx
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, value))
    .orderBy(asc(pushSubscriptions.accountType));

const device = (value: string) => ({
  endpoint: value,
  p256dh: 'key-1',
  auth: 'auth-1',
  userAgent: null,
});

describeDb('웹 푸시 구독 저장 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('readPushTargets는 그 사람의 그 계정 종류 구독만 기기마다 읽는다', async () => {
    await withRollback(async (tx) => {
      const userId = await createTestUser(tx);
      const other = await createTestUser(tx);
      const [mine1, mine2, ownerOnly, others] = [endpoint(), endpoint(), endpoint(), endpoint()];
      await upsertPushSubscription(tx, { userId, accountType: 'customer', ...device(mine1) });
      await upsertPushSubscription(tx, { userId, accountType: 'customer', ...device(mine2) });
      await upsertPushSubscription(tx, { userId, accountType: 'owner', ...device(ownerOnly) });
      await upsertPushSubscription(tx, {
        userId: other,
        accountType: 'customer',
        ...device(others),
      });
      const targets = await readPushTargets(tx, { userId, accountType: 'customer' });
      expect(targets.map((target) => target.endpoint).sort()).toEqual([mine1, mine2].sort());
      expect(targets[0]).toEqual({
        endpoint: targets[0].endpoint,
        p256dh: 'key-1',
        auth: 'auth-1',
      });
    });
  });

  it('deleteExpiredPushSubscription은 끝난 기기의 구독을 두 계정 모두 지운다', async () => {
    await withRollback(async (tx) => {
      const userId = await createTestUser(tx);
      const [expired, alive] = [endpoint(), endpoint()];
      await upsertPushSubscription(tx, { userId, accountType: 'customer', ...device(expired) });
      await upsertPushSubscription(tx, { userId, accountType: 'owner', ...device(expired) });
      await upsertPushSubscription(tx, { userId, accountType: 'customer', ...device(alive) });
      await deleteExpiredPushSubscription(tx, expired);
      expect(await rowsOf(tx, expired)).toEqual([]);
      expect(await rowsOf(tx, alive)).toHaveLength(1);
    });
  });

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

  it('한 기기에 고객·원장님 구독을 하나씩 저장한다', async () => {
    await withRollback(async (tx) => {
      const userId = await createTestUser(tx);
      const value = endpoint();
      await upsertPushSubscription(tx, { ...device(value), userId, accountType: 'customer' });
      await upsertPushSubscription(tx, { ...device(value), userId, accountType: 'owner' });
      expect(await rowsOf(tx, value)).toMatchObject([
        { userId, accountType: 'customer' },
        { userId, accountType: 'owner' },
      ]);
    });
  });

  it('같은 기기·같은 계정 종류로 다시 구독하면 덮어쓰고, 다른 계정 구독은 그대로다', async () => {
    await withRollback(async (tx) => {
      const userId = await createTestUser(tx);
      const value = endpoint();
      await upsertPushSubscription(tx, { ...device(value), userId, accountType: 'customer' });
      await upsertPushSubscription(tx, { ...device(value), userId, accountType: 'owner' });
      await upsertPushSubscription(tx, {
        ...device(value),
        userId,
        accountType: 'owner',
        p256dh: 'key-2',
        userAgent: 'iPhone',
      });
      expect(await rowsOf(tx, value)).toMatchObject([
        { accountType: 'customer', p256dh: 'key-1', userAgent: null },
        { accountType: 'owner', p256dh: 'key-2', userAgent: 'iPhone' },
      ]);
    });
  });

  it('같은 기기에서 다른 로그인이 구독하면 이전 로그인의 구독을 모두 지운다', async () => {
    await withRollback(async (tx) => {
      const first = await createTestUser(tx);
      const second = await createTestUser(tx);
      const value = endpoint();
      await upsertPushSubscription(tx, {
        ...device(value),
        userId: first,
        accountType: 'customer',
      });
      await upsertPushSubscription(tx, { ...device(value), userId: first, accountType: 'owner' });
      await upsertPushSubscription(tx, {
        ...device(value),
        userId: second,
        accountType: 'customer',
      });
      expect(await rowsOf(tx, value)).toMatchObject([{ userId: second, accountType: 'customer' }]);
    });
  });

  it('구독 저장은 다른 기기의 구독을 건드리지 않는다', async () => {
    await withRollback(async (tx) => {
      const first = await createTestUser(tx);
      const second = await createTestUser(tx);
      const firstDevice = endpoint();
      const secondDevice = endpoint();
      await upsertPushSubscription(tx, {
        ...device(firstDevice),
        userId: first,
        accountType: 'customer',
      });
      await upsertPushSubscription(tx, {
        ...device(secondDevice),
        userId: second,
        accountType: 'customer',
      });
      expect(await rowsOf(tx, firstDevice)).toHaveLength(1);
      expect(await rowsOf(tx, secondDevice)).toHaveLength(1);
    });
  });

  it('알림 끄기는 그 계정 종류의 내 구독만 지운다', async () => {
    await withRollback(async (tx) => {
      const me = await createTestUser(tx);
      const other = await createTestUser(tx);
      const value = endpoint();
      await upsertPushSubscription(tx, { ...device(value), userId: me, accountType: 'customer' });
      await upsertPushSubscription(tx, { ...device(value), userId: me, accountType: 'owner' });

      const key = { endpoint: value, accountType: 'owner' } as const;
      expect(await deletePushSubscription(tx, { ...key, userId: other })).toBe(false);
      expect(await rowsOf(tx, value)).toHaveLength(2);

      expect(await deletePushSubscription(tx, { ...key, userId: me })).toBe(true);
      expect(await rowsOf(tx, value)).toMatchObject([{ userId: me, accountType: 'customer' }]);

      expect(await deletePushSubscription(tx, { ...key, userId: me })).toBe(false);
    });
  });

  it('로그아웃은 이 기기의 내 구독을 모두 지우고, 다른 기기 구독과 남의 구독은 그대로다', async () => {
    await withRollback(async (tx) => {
      const me = await createTestUser(tx);
      const other = await createTestUser(tx);
      const value = endpoint();
      const myOtherDevice = endpoint();
      await upsertPushSubscription(tx, { ...device(value), userId: me, accountType: 'customer' });
      await upsertPushSubscription(tx, { ...device(value), userId: me, accountType: 'owner' });
      await upsertPushSubscription(tx, {
        ...device(myOtherDevice),
        userId: me,
        accountType: 'customer',
      });

      expect(await deleteDevicePushSubscriptions(tx, { userId: other, endpoint: value })).toBe(0);
      expect(await rowsOf(tx, value)).toHaveLength(2);

      expect(await deleteDevicePushSubscriptions(tx, { userId: me, endpoint: value })).toBe(2);
      expect(await rowsOf(tx, value)).toHaveLength(0);
      expect(await rowsOf(tx, myOtherDevice)).toHaveLength(1);

      expect(await deleteDevicePushSubscriptions(tx, { userId: me, endpoint: value })).toBe(0);
    });
  });

  it('조회는 이 기기·이 계정 종류·이 로그인의 구독만 켜진 것으로 본다', async () => {
    await withRollback(async (tx) => {
      const me = await createTestUser(tx);
      const other = await createTestUser(tx);
      const value = endpoint();
      await upsertPushSubscription(tx, { ...device(value), userId: me, accountType: 'owner' });

      const has = (userId: string, accountType: 'customer' | 'owner', at = value) =>
        hasPushSubscription(tx, { userId, accountType, endpoint: at });
      expect(await has(me, 'owner')).toBe(true);
      expect(await has(me, 'customer')).toBe(false);
      expect(await has(other, 'owner')).toBe(false);
      expect(await has(me, 'owner', endpoint())).toBe(false);
    });
  });
});
