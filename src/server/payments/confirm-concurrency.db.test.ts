// 같은 주문을 동시에 두 번 확인할 때(새로고침, 웹훅 W13)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 연결이 둘 이상이고 데이터가 저장(커밋)돼 있어야 해서, hold-concurrency.db.test.ts처럼 연결을 따로 열고 만든 데이터를 끝에 지운다.
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

import { createTestCustomer, createTestShop, testSlot } from '../../../tests/db/fixtures';
import { assertLocalTestDb, describeDb } from '../../../tests/db/test-db';
import { confirmPaidOrder } from './confirm-store';
import { createPendingOrder, newPaymentId } from './order-store';

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

describeDb('결제 확인 동시에 두 번 (실제 DB, 연결 여러 개)', () => {
  let db: ReturnType<typeof connect>;
  const made = { userIds: [] as string[], customerId: '', shopId: '', menuId: '' };

  beforeAll(async () => {
    db = connect();
    await db.transaction(async (tx) => {
      const shop = await createTestShop(tx, {
        status: 'approved',
        name: '[동시 테스트] 결제 확인 샵',
        location: { lng: 129.0756, lat: 35.1796 },
        sido: '부산',
        sigungu: '동시테스트구',
      });
      const customer = await createTestCustomer(tx);
      made.shopId = shop.shopId;
      made.menuId = shop.menuId;
      made.customerId = customer.customerId;
      made.userIds = [shop.createdBy, customer.userId];
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.transaction(async (tx) => {
      const slotIds = (
        await tx.select({ id: slots.id }).from(slots).where(eq(slots.shopId, made.shopId))
      ).map((row) => row.id);
      if (slotIds.length > 0) {
        await tx.delete(reservations).where(inArray(reservations.slotId, slotIds));
        await tx.delete(orders).where(inArray(orders.slotId, slotIds));
      }
      await tx.delete(slots).where(eq(slots.shopId, made.shopId));
      await tx.delete(menus).where(eq(menus.shopId, made.shopId));
      await tx.delete(shops).where(eq(shops.id, made.shopId));
      await tx.delete(owners).where(inArray(owners.userId, made.userIds));
      await tx.delete(customers).where(eq(customers.id, made.customerId));
      await tx.delete(profiles).where(inArray(profiles.id, made.userIds));
      await tx.delete(authUsers).where(inArray(authUsers.id, made.userIds));
    });
    await db.$client.end();
  });

  /** 매물마다 시간이 겹치지 않게 시작 시각을 바꿔 가며 홀딩된 매물과 결제 대기 주문을 만든다 */
  async function heldAndOrdered(round: number) {
    const start = `${String(10 + round).padStart(2, '0')}:00`;
    const end = `${String(10 + round).padStart(2, '0')}:30`;
    return db.transaction(async (tx) => {
      const [slot] = await tx
        .insert(slots)
        .values(
          testSlot(
            { shopId: made.shopId, menuId: made.menuId, createdBy: made.userIds[0] },
            start,
            end,
            {
              holdCustomerId: made.customerId,
              holdExpiresAt: new Date(NOW.getTime() + 10 * 60 * 1000),
            },
          ),
        )
        .returning({ id: slots.id });
      const orderId = await createPendingOrder(tx, {
        paymentId: newPaymentId(),
        slotId: slot.id,
        customerId: made.customerId,
        salePrice: 14_000,
        couponAmount: 0,
        amount: 14_000,
        agreedAt: NOW,
      });
      return { slotId: slot.id, orderId };
    });
  }

  const confirm = (orderId: string) =>
    db.transaction((tx) =>
      confirmPaidOrder(tx, {
        orderId,
        pgStatus: 'PAID',
        payMethod: 'PaymentMethodCard',
        paidAt: new Date(NOW.getTime() + 3 * 60 * 1000),
      }),
    );

  it('같은 주문을 동시에 두 번 확인해도 예약은 하나이고 둘 다 같은 예약을 받는다', async () => {
    for (let round = 0; round < REPEAT; round++) {
      const { slotId, orderId } = await heldAndOrdered(round);
      const [first, second] = await Promise.all([confirm(orderId), confirm(orderId)]);
      expect(first.ok && second.ok).toBe(true);
      expect(first).toEqual(second);
      const rows = await db.select().from(reservations).where(eq(reservations.slotId, slotId));
      expect(rows).toHaveLength(1);
      const [slot] = await db.select().from(slots).where(eq(slots.id, slotId));
      expect(slot.status).toBe('reserved');
    }
  });
});
