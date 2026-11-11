// 쿠폰 DB 읽기·쓰기를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다 (#300, C-407).

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { coupons } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback, type TestTx } from '../../../tests/db/test-db';
import { markCouponUsed, readMyCoupon, readUsableCoupons } from './coupon-store';

type Db = Parameters<typeof markCouponUsed>[0] & Parameters<typeof readMyCoupon>[0];

const NOW = new Date('2026-11-11T12:00:00+09:00');
const DAY = 24 * 60 * 60 * 1000;

async function insertCoupon(tx: TestTx, customerId: string, expiresInDays: number) {
  const [row] = await tx
    .insert(coupons)
    .values({
      customerId,
      amount: 3000,
      reason: 'owner_fault_compensation',
      issuedAt: new Date(NOW.getTime() - DAY),
      expiresAt: new Date(NOW.getTime() + expiresInDays * DAY),
    })
    .returning({ id: coupons.id });
  return row.id;
}

describeDb('쿠폰 저장 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('쓸 수 있는 쿠폰만 기한 빠른 순으로 읽는다(쓴 것·기한 지난 것·남의 쿠폰 제외)', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const other = await createTestCustomer(tx);
      const late = await insertCoupon(tx, me.customerId, 60);
      const soon = await insertCoupon(tx, me.customerId, 5);
      await insertCoupon(tx, me.customerId, -1);
      const used = await insertCoupon(tx, me.customerId, 30);
      await insertCoupon(tx, other.customerId, 30);
      const { order } = await createTestReservation(
        tx,
        shop,
        me.customerId,
        '09:00',
        '10:00',
        'confirmed',
      );
      expect(await markCouponUsed(db, { couponId: used, orderId: order.id, usedAt: NOW })).toBe(
        true,
      );

      const rows = await readUsableCoupons(db, { customerId: me.customerId, now: NOW });
      expect(rows.map((row) => row.couponId)).toEqual([soon, late]);
      expect(rows[0]).toEqual({
        couponId: soon,
        amount: 3000,
        expiresAt: new Date(NOW.getTime() + 5 * DAY),
        usedOrderId: null,
      });
    });
  });

  it('내 쿠폰 한 장은 쓴 것도 읽고, 남의 쿠폰은 null', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const me = await createTestCustomer(tx);
      const other = await createTestCustomer(tx);
      const mine = await insertCoupon(tx, me.customerId, -1);
      expect(await readMyCoupon(db, { couponId: mine, customerId: me.customerId })).toMatchObject({
        couponId: mine,
        usedOrderId: null,
      });
      expect(await readMyCoupon(db, { couponId: mine, customerId: other.customerId })).toBeNull();
    });
  });

  it('사용 처리는 아직 안 쓴 쿠폰만 한 번 바꾼다(두 번째 주문은 false)', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const couponId = await insertCoupon(tx, me.customerId, 30);
      const first = await createTestReservation(
        tx,
        shop,
        me.customerId,
        '09:00',
        '10:00',
        'confirmed',
      );
      const second = await createTestReservation(
        tx,
        shop,
        me.customerId,
        '11:00',
        '12:00',
        'confirmed',
      );

      expect(await markCouponUsed(db, { couponId, orderId: first.order.id, usedAt: NOW })).toBe(
        true,
      );
      expect(await markCouponUsed(db, { couponId, orderId: second.order.id, usedAt: NOW })).toBe(
        false,
      );
      const [row] = await tx.select().from(coupons).where(eq(coupons.id, couponId));
      expect(row).toMatchObject({ usedOrderId: first.order.id, usedAt: NOW });
    });
  });
});
