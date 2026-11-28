// 투리로 아낀 금액(C-108)이 방문 완료 예약만 더하는지 실제 DB로 본다.
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { orders } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
} from '../../../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../../../tests/db/test-db';
import { selectSavedAmount } from './saved-amount';

afterAll(closeTestDb);

describeDb('투리로 아낀 금액 (C-108)', () => {
  it('방문 완료 예약의 (정가 − 실제 결제액)을 더하고, 쿠폰으로 덜 낸 금액도 넣는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      // 테스트 매물: 정가 20,000원, 30% 할인 14,000원 → 6,000원 아낌
      await createTestReservation(tx, shop, me.customerId, '09:00', '10:00', 'completed', {
        visitResult: 'visited',
      });
      // 쿠폰 3,000원을 써서 11,000원 결제 → 9,000원 아낌
      const withCoupon = await createTestReservation(
        tx,
        shop,
        me.customerId,
        '11:00',
        '12:00',
        'completed',
        { visitResult: 'visited' },
      );
      await tx
        .update(orders)
        .set({ couponAmount: 3000, amount: 11000 })
        .where(eq(orders.id, withCoupon.order.id));

      expect(await selectSavedAmount(tx, me.customerId)).toEqual({ total: 15000, visits: 2 });
    });
  });

  it('노쇼·취소·예정·무효 예약과 다른 손님의 예약은 더하지 않는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const other = await createTestCustomer(tx);
      await createTestReservation(tx, shop, me.customerId, '08:00', '09:00', 'completed', {
        visitResult: 'visited',
      });
      await createTestReservation(tx, shop, me.customerId, '09:00', '10:00', 'completed', {
        visitResult: 'no_show',
      });
      await createTestReservation(tx, shop, me.customerId, '10:00', '11:00', 'cancelled', {
        cancelActor: 'customer',
        cancelledAt: new Date('2026-10-31T09:00:00+09:00'),
      });
      await createTestReservation(tx, shop, me.customerId, '11:00', '12:00', 'confirmed');
      await createTestReservation(tx, shop, me.customerId, '12:00', '13:00', 'completed', {
        visitResult: 'visited',
        voidedAt: new Date('2026-11-02T10:00:00+09:00'),
      });
      await createTestReservation(tx, shop, other.customerId, '13:00', '14:00', 'completed', {
        visitResult: 'visited',
      });

      expect(await selectSavedAmount(tx, me.customerId)).toEqual({ total: 6000, visits: 1 });
    });
  });

  it('아직 방문을 마친 예약이 없으면 0원', async () => {
    await withRollback(async (tx) => {
      const me = await createTestCustomer(tx);
      expect(await selectSavedAmount(tx, me.customerId)).toEqual({ total: 0, visits: 0 });
    });
  });
});
