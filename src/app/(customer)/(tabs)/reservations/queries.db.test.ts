// 내 예약 조회가 본인 예약만, 탭별로, 순서대로 돌려주는지 실제 DB로 본다(X-102, C-501·C-502).
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { afterAll, expect, it } from 'vitest';

import { orders, refunds, reservations, slots } from '@/db/schema';

import {
  createTestCustomer,
  createTestShop,
  testSlot,
  type TestShop,
} from '../../../../../tests/db/fixtures';
import {
  closeTestDb,
  describeDb,
  type TestTx,
  withRollback,
} from '../../../../../tests/db/test-db';
import { selectMyReservationDetail, selectMyReservations } from './queries';

afterAll(closeTestDb);

let seq = 0;

/** 매물 → 주문 → 예약 한 벌. status·시각 등은 넘긴 값으로 */
async function createReservation(
  tx: TestTx,
  ids: TestShop,
  customerId: string,
  start: string,
  end: string,
  status: 'confirmed' | 'completed' | 'cancelled',
  extra: Partial<typeof reservations.$inferInsert> = {},
) {
  seq += 1;
  const slotStatus =
    status === 'cancelled' ? 'cancelled' : status === 'completed' ? 'completed' : 'reserved';
  const [slot] = await tx
    .insert(slots)
    .values(testSlot(ids, start, end, { status: slotStatus }))
    .returning();
  const [order] = await tx
    .insert(orders)
    .values({
      paymentId: `test_${seq}_${crypto.randomUUID()}`,
      slotId: slot.id,
      customerId,
      salePrice: 14000,
      amount: 14000,
      refundPolicyVersion: 'test',
      refundPolicyAgreedAt: new Date('2026-10-30T10:00:00+09:00'),
      status: 'confirmed',
      paidAt: new Date('2026-10-30T10:05:00+09:00'),
    })
    .returning();
  const [reservation] = await tx
    .insert(reservations)
    .values({
      code: `T${String(seq).padStart(7, '0')}`,
      slotId: slot.id,
      orderId: order.id,
      customerId,
      status,
      ...extra,
    })
    .returning();
  return { reservation, order };
}

describeDb('내 예약 조회', () => {
  it('본인 예약만, 탭별로, 예정은 가까운 순', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const other = await createTestCustomer(tx);

      await createReservation(tx, shop, me.customerId, '15:00', '16:00', 'confirmed');
      await createReservation(tx, shop, me.customerId, '11:00', '12:00', 'confirmed');
      await createReservation(tx, shop, me.customerId, '09:00', '10:00', 'completed', {
        visitResult: 'no_show',
      });
      await createReservation(tx, shop, other.customerId, '13:00', '14:00', 'confirmed');

      const upcoming = await selectMyReservations(tx, me.customerId, 'upcoming');
      expect(upcoming.map((item) => new Date(item.startAt).getUTCHours())).toEqual([2, 6]); // 11시, 15시(한국)
      expect(upcoming.every((item) => !item.noShow)).toBe(true);

      const completed = await selectMyReservations(tx, me.customerId, 'completed');
      expect(completed).toHaveLength(1);
      expect(completed[0].noShow).toBe(true);

      expect(await selectMyReservations(tx, me.customerId, 'cancelled')).toEqual([]);
    });
  });

  it('상세는 본인 예약만 열리고, 취소면 환불 내역이 함께 온다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const other = await createTestCustomer(tx);

      const { reservation, order } = await createReservation(
        tx,
        shop,
        me.customerId,
        '15:00',
        '16:00',
        'cancelled',
        { cancelledAt: new Date('2026-10-31T10:00:00+09:00'), cancelActor: 'customer' },
      );
      await tx.insert(refunds).values({
        orderId: order.id,
        reservationId: reservation.id,
        reason: 'customer_cancel',
        band: 'over_24h',
        penaltyRate: 30,
        refundAmount: 9800,
        penaltyAmount: 4200,
        processedAt: new Date('2026-10-31T10:01:00+09:00'),
      });

      const mine = await selectMyReservationDetail(tx, me.customerId, reservation.id);
      expect(mine?.status).toBe('cancelled');
      expect(mine?.refund).toMatchObject({
        refundAmount: 9800,
        penaltyAmount: 4200,
        penaltyRate: 30,
      });
      expect(mine?.payment.amount).toBe(14000);

      expect(await selectMyReservationDetail(tx, other.customerId, reservation.id)).toBeNull();
    });
  });
});
