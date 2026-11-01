// 같은 예약을 동시에 두 번 처리할 때(두 번 누름, 창 두 개)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 연결이 둘 이상이고 데이터가 저장(커밋)돼 있어야 해서, confirm-concurrency.db.test.ts처럼 연결을 따로 열고 만든 데이터를 끝에 지운다.
// 다른 테스트와 섞이지 않게 샵을 다른 테스트(안산)에서 멀리(부산) 둔다.

import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { authUsers } from 'drizzle-orm/supabase';
import postgres from 'postgres';
import { afterAll, beforeAll, expect, it } from 'vitest';

import * as schema from '@/db/schema';
import {
  customers,
  menus,
  orders,
  owners,
  profiles,
  reservations,
  shops,
  slots,
} from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  type TestShop,
} from '../../../tests/db/fixtures';
import { assertLocalTestDb, describeDb } from '../../../tests/db/test-db';
import { recordVisitInTx } from './visit-store';

const NOW = new Date('2026-11-01T20:00:00+09:00');
const REPEAT = 5;

function connect() {
  const url = process.env.TEST_DATABASE_URL!;
  assertLocalTestDb(url);
  return drizzle(postgres(url, { max: 4, onnotice: () => {} }), {
    schema,
    casing: 'snake_case',
  });
}

describeDb('방문·노쇼 동시에 두 번 처리 (실제 DB, 연결 여러 개)', () => {
  let db: ReturnType<typeof connect>;
  let shop: TestShop;
  const made = { userIds: [] as string[], customerId: '' };

  beforeAll(async () => {
    db = connect();
    await db.transaction(async (tx) => {
      shop = await createTestShop(tx, {
        status: 'approved',
        name: '[동시 테스트] 방문 처리 샵',
        location: { lng: 129.0403, lat: 35.1151 },
        sido: '부산',
        sigungu: '동시테스트구',
      });
      const customer = await createTestCustomer(tx);
      made.customerId = customer.customerId;
      made.userIds = [shop.createdBy, customer.userId];
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.transaction(async (tx) => {
      const slotIds = (
        await tx.select({ id: slots.id }).from(slots).where(eq(slots.shopId, shop.shopId))
      ).map((row) => row.id);
      if (slotIds.length > 0) {
        await tx.delete(reservations).where(inArray(reservations.slotId, slotIds));
        await tx.delete(orders).where(inArray(orders.slotId, slotIds));
      }
      await tx.delete(slots).where(eq(slots.shopId, shop.shopId));
      await tx.delete(menus).where(eq(menus.shopId, shop.shopId));
      await tx.delete(shops).where(eq(shops.id, shop.shopId));
      await tx.delete(owners).where(inArray(owners.userId, made.userIds));
      await tx.delete(customers).where(eq(customers.id, made.customerId));
      await tx.delete(profiles).where(inArray(profiles.id, made.userIds));
      await tx.delete(authUsers).where(inArray(authUsers.id, made.userIds));
    });
    await db.$client.end();
  });

  const record = (reservationId: string, result: 'visited' | 'no_show') =>
    db.transaction((tx) =>
      recordVisitInTx(tx, {
        shopId: shop.shopId,
        reservationId,
        result,
        recordedBy: shop.createdBy,
        now: NOW,
      }),
    );

  it('방문 완료와 노쇼를 동시에 눌러도 하나만 처리되고 다른 하나는 ALREADY_RECORDED다', async () => {
    for (let round = 0; round < REPEAT; round++) {
      // 매물마다 시간이 겹치지 않게 시작 시각을 바꾼다
      const hour = String(10 + round).padStart(2, '0');
      const { reservation } = await db.transaction((tx) =>
        createTestReservation(tx, shop, made.customerId, `${hour}:00`, `${hour}:30`, 'confirmed'),
      );

      const [first, second] = await Promise.all([
        record(reservation.id, 'visited'),
        record(reservation.id, 'no_show'),
      ]);
      const winners = [first, second].filter((result) => result.ok);
      const losers = [first, second].filter((result) => !result.ok);
      expect(winners).toHaveLength(1);
      expect(losers.map((result) => (result.ok ? null : result.error.code))).toEqual([
        'ALREADY_RECORDED',
      ]);

      const [row] = await db.select().from(reservations).where(eq(reservations.id, reservation.id));
      const winner = winners[0];
      expect(row.visitResult).toBe(winner.ok ? winner.data.visitResult : null);
      expect(row.status).toBe('completed');
    }
  });
});
