// 10분 홀딩을 동시에 눌렀을 때(X-304, #15 W10)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 동시에 누르려면 연결이 둘 이상이고 데이터가 저장(커밋)돼 있어야 해서, withRollback 대신 이 파일에서 연결을 따로 열고
// 만든 데이터를 끝에 지운다. 다른 테스트와 섞이지 않게 샵 위치를 다른 테스트(안산)에서 멀리(부산) 둔다.
// 테스트 공통 도구에 동시 테스트 도우미가 생기면 그쪽으로 옮긴다.

import { eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { authUsers } from 'drizzle-orm/supabase';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import * as schema from '@/db/schema';
import { customers, menus, owners, profiles, shops, slots } from '@/db/schema';

import { createTestCustomer, createTestShop, testSlot } from '../../../tests/db/fixtures';
import { assertLocalTestDb, describeDb } from '../../../tests/db/test-db';
import { acquireHold, type HoldOutcome } from './hold-store';

const NOW = new Date('2026-11-01T09:00:00+09:00');
const REPEAT = 5;

function connect() {
  const url = process.env.TEST_DATABASE_URL!;
  assertLocalTestDb(url);
  return drizzle(postgres(url, { max: 4, onnotice: () => {} }), {
    schema,
    casing: 'snake_case',
  });
}

describeDb('10분 홀딩 동시에 누르기 (실제 DB, 연결 여러 개)', () => {
  let db: ReturnType<typeof connect>;
  const made = {
    userIds: [] as string[],
    customerIds: [] as string[],
    shopId: '',
    slotIds: [] as string[],
  };

  beforeAll(async () => {
    db = connect();
    await db.transaction(async (tx) => {
      const shop = await createTestShop(tx, {
        status: 'approved',
        name: '[동시 테스트] 홀딩 샵',
        location: { lng: 129.0756, lat: 35.1796 },
        sido: '부산',
        sigungu: '동시테스트구',
      });
      const a = await createTestCustomer(tx);
      const b = await createTestCustomer(tx);
      const rows = await tx
        .insert(slots)
        .values([testSlot(shop, '10:00', '11:00'), testSlot(shop, '12:00', '13:00')])
        .returning({ id: slots.id });
      made.shopId = shop.shopId;
      made.slotIds = rows.map((row) => row.id);
      made.customerIds = [a.customerId, b.customerId];
      made.userIds = [shop.createdBy, a.userId, b.userId];
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.transaction(async (tx) => {
      await tx.delete(slots).where(eq(slots.shopId, made.shopId));
      await tx.delete(menus).where(eq(menus.shopId, made.shopId));
      await tx.delete(shops).where(eq(shops.id, made.shopId));
      await tx.delete(owners).where(inArray(owners.userId, made.userIds));
      await tx.delete(customers).where(inArray(customers.id, made.customerIds));
      await tx.delete(profiles).where(inArray(profiles.id, made.userIds));
      await tx.delete(authUsers).where(inArray(authUsers.id, made.userIds));
    });
    await db.$client.end();
  });

  beforeEach(async () => {
    await db
      .update(slots)
      .set({ holdCustomerId: null, holdExpiresAt: null })
      .where(eq(slots.shopId, made.shopId));
  });

  const hold = (slotId: string, customerId: string) =>
    db.transaction((tx) => acquireHold(tx, { slotId, customerId, now: NOW }));

  /** 앞 사람은 홀딩한 뒤 0.5초 동안 트랜잭션을 열어 두고, 뒤 사람은 0.1초 뒤에 누른다(뒤 사람이 기다리는 경우를 꼭 만든다) */
  async function slowThenFast(first: [string, string], second: [string, string]) {
    const slow = db.transaction(async (tx) => {
      const result = await acquireHold(tx, { slotId: first[0], customerId: first[1], now: NOW });
      await tx.execute(sql`select pg_sleep(0.5)`);
      return result;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    return Promise.all([slow, hold(...second)]);
  }

  const holders = async (slotId: string) =>
    (
      await db.select({ customerId: slots.holdCustomerId }).from(slots).where(eq(slots.id, slotId))
    ).map((row) => row.customerId);

  it('두 고객이 같은 매물을 동시에 누르면 한 명만 홀딩된다', async () => {
    const [slotId] = made.slotIds;
    const [a, b] = made.customerIds;
    for (let i = 0; i < REPEAT; i++) {
      await db
        .update(slots)
        .set({ holdCustomerId: null, holdExpiresAt: null })
        .where(eq(slots.id, slotId));
      const results: HoldOutcome[] = await Promise.all([hold(slotId, a), hold(slotId, b)]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, code: 'HELD_BY_OTHER' }]);
      const winner = results[0].ok ? a : b;
      expect(await holders(slotId)).toEqual([winner]);
    }
  });

  it('앞 사람이 홀딩하는 중에 누른 뒤 사람은 기다렸다가 HELD_BY_OTHER', async () => {
    const [slotId] = made.slotIds;
    const [a, b] = made.customerIds;
    const [first, second] = await slowThenFast([slotId, a], [slotId, b]);
    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, code: 'HELD_BY_OTHER' });
    expect(await holders(slotId)).toEqual([a]);
  });

  it('한 고객이 두 매물을 동시에 누르면 하나만 홀딩된다', async () => {
    const [first, second] = made.slotIds;
    const [a] = made.customerIds;
    for (let i = 0; i < REPEAT; i++) {
      await db
        .update(slots)
        .set({ holdCustomerId: null, holdExpiresAt: null })
        .where(eq(slots.shopId, made.shopId));
      const results = await Promise.all([hold(first, a), hold(second, a)]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok)).toMatchObject([{ ok: false, code: 'ALREADY_HOLDING' }]);
      const held = [...(await holders(first)), ...(await holders(second))].filter(Boolean);
      expect(held).toEqual([a]);
    }
  });

  it('한 고객이 앞 매물을 홀딩하는 중에 다른 매물을 누르면 기다렸다가 ALREADY_HOLDING', async () => {
    const [first, second] = made.slotIds;
    const [a] = made.customerIds;
    const [one, two] = await slowThenFast([first, a], [second, a]);
    expect(one.ok).toBe(true);
    expect(two).toEqual({ ok: false, code: 'ALREADY_HOLDING', heldSlotId: first });
  });
});
