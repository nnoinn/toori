// 합의 후 취소의 예약 값 읽기를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다 (#301 가짜 결과 버전).

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { orders } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../tests/db/test-db';
import { readAgreedCancelTarget } from './agreed-cancel-store';

type Db = Parameters<typeof readAgreedCancelTarget>[0];

describeDb('합의 후 취소 예약 값 읽기 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('예약의 고객·샵·상태·시작과 주문의 판매가·결제액·쿠폰을 읽고, 없는 예약은 null', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const { reservation, slot, order } = await createTestReservation(
        tx,
        shop,
        customerId,
        '09:00',
        '10:00',
        'confirmed',
      );
      // 쿠폰을 쓴 주문처럼 결제액을 바꿔 둔다(판매가 14,000 − 쿠폰 3,000)
      await tx
        .update(orders)
        .set({ couponAmount: 3000, amount: 11_000 })
        .where(eq(orders.id, order.id));

      expect(await readAgreedCancelTarget(db, reservation.id)).toEqual({
        reservationId: reservation.id,
        customerId,
        shopId: shop.shopId,
        status: 'confirmed',
        visitResult: null,
        startAt: slot.startAt,
        salePrice: 14_000,
        paidAmount: 11_000,
        couponAmount: 3000,
      });
      expect(await readAgreedCancelTarget(db, crypto.randomUUID())).toBeNull();
    });
  });
});
