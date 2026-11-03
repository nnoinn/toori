// 같은 예약을 동시에 두 번 취소할 때(두 번 누름, 창 두 개)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 연결이 둘 이상이고 데이터가 저장(커밋)돼 있어야 해서, visit-concurrency.db.test.ts처럼 직접 만들고 끝나면 지운다.
// 다른 테스트와 섞이지 않게 샵을 다른 테스트(안산)에서 멀리(대전) 둔다.

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
  refunds,
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
import { finishCustomerCancel, requestCustomerCancel } from './refund-store';

const NOW = new Date('2026-11-01T08:00:00+09:00');
const REPEAT = 5;

function connect() {
  const url = process.env.TEST_DATABASE_URL!;
  assertLocalTestDb(url);
  return drizzle(postgres(url, { max: 4, onnotice: () => {} }), {
    schema,
    casing: 'snake_case',
  });
}

describeDb('예약을 동시에 두 번 취소 (실제 DB, 연결 여러 개)', () => {
  let db: ReturnType<typeof connect>;
  let shop: TestShop;
  const made = { userIds: [] as string[], customerId: '' };

  beforeAll(async () => {
    db = connect();
    await db.transaction(async (tx) => {
      shop = await createTestShop(tx, {
        status: 'approved',
        name: '[동시 테스트] 예약 취소 샵',
        location: { lng: 127.3845, lat: 36.3504 },
        sido: '대전',
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
        const orderIds = (
          await tx.select({ id: orders.id }).from(orders).where(inArray(orders.slotId, slotIds))
        ).map((row) => row.id);
        if (orderIds.length > 0) await tx.delete(refunds).where(inArray(refunds.orderId, orderIds));
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

  it('동시에 시작해도 진행 중 기록은 하나이고, 동시에 끝내도 환불 기록은 한 줄이다', async () => {
    for (let round = 0; round < REPEAT; round++) {
      // 매물마다 시간이 겹치지 않게 시작 시각을 바꾼다
      const hour = String(10 + round).padStart(2, '0');
      const booking = await db.transaction((tx) =>
        createTestReservation(tx, shop, made.customerId, `${hour}:00`, `${hour}:30`, 'confirmed'),
      );
      const amounts = {
        reservationId: booking.reservation.id,
        orderId: booking.order.id,
        band: 'over_24h' as const,
        penaltyRate: 30,
        refundAmount: 9_800,
        penaltyAmount: 4_200,
      };
      const start = () => requestCustomerCancel(db, { ...amounts, requestedAt: NOW });
      const finish = () =>
        db.transaction((tx) =>
          finishCustomerCancel(tx, {
            ...amounts,
            slotId: booking.slot.id,
            pgCancellationId: 'c-1',
            reviewReason: null,
            hoursBeforeStart: 30,
            requestedAt: NOW,
            now: NOW,
          }),
        );

      const started = await Promise.all([start(), start()]);
      expect(started.filter(Boolean)).toHaveLength(1);

      const finished = await Promise.all([finish(), finish()]);
      expect(finished.filter(Boolean)).toHaveLength(1);

      const rows = await db
        .select()
        .from(refunds)
        .where(eq(refunds.reservationId, booking.reservation.id));
      expect(rows.map((row) => row.status)).toEqual(['done']);
    }
  });
});
