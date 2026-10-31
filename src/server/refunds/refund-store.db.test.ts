// 예약 취소 DB 읽기(readRefundTarget)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다. 내 예약만 읽고, 결제액·판매가·쿠폰·시작 시각을 가져온다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { orders } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../tests/db/test-db';
import { readRefundTarget } from './refund-store';

describeDb('예약 취소 DB 읽기 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('내 예약의 상태·결제액·판매가·쿠폰·시작 시각을 읽는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const { slot, order, reservation } = await createTestReservation(
        tx,
        shop,
        me.customerId,
        '10:00',
        '11:00',
        'confirmed',
      );
      expect(await readRefundTarget(reservation.id, me.customerId, tx)).toEqual({
        reservationId: reservation.id,
        status: 'confirmed',
        paidAmount: order.amount,
        salePrice: slot.salePrice,
        couponAmount: 0,
        startAt: slot.startAt,
      });

      await tx
        .update(orders)
        .set({ couponAmount: 3_000, amount: 11_000 })
        .where(eq(orders.id, order.id));
      expect(await readRefundTarget(reservation.id, me.customerId, tx)).toMatchObject({
        paidAmount: 11_000,
        salePrice: 14_000,
        couponAmount: 3_000,
      });
    });
  });

  it('남의 예약과 없는 예약은 null', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const other = await createTestCustomer(tx);
      const { reservation } = await createTestReservation(
        tx,
        shop,
        other.customerId,
        '10:00',
        '11:00',
        'confirmed',
      );
      expect(await readRefundTarget(reservation.id, me.customerId, tx)).toBeNull();
      expect(await readRefundTarget(crypto.randomUUID(), me.customerId, tx)).toBeNull();
    });
  });
});
