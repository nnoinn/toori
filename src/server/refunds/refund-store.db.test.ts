// 예약 취소 DB 읽기·저장을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다. 내 예약만 읽고, 취소하면 예약·매물·환불 기록이 함께 바뀐다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { orders, refunds, reservations, slots } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../tests/db/test-db';
import { readRefundTarget, recordCustomerCancel } from './refund-store';

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
        orderId: order.id,
        slotId: slot.id,
        paymentId: order.paymentId,
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

  const NOW = new Date('2026-11-01T10:00:00+09:00');
  const cancelInput = (made: {
    slot: { id: string };
    order: { id: string };
    reservation: { id: string };
  }) => ({
    reservationId: made.reservation.id,
    orderId: made.order.id,
    slotId: made.slot.id,
    band: 'over_24h' as const,
    penaltyRate: 30,
    refundAmount: 9_800,
    penaltyAmount: 4_200,
    pgCancellationId: 'c-1',
    hoursBeforeStart: 30.5,
    now: NOW,
  });

  it('고객 취소: 예약·매물이 취소되고 환불 기록과 포트원 상태가 남는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const made = await createTestReservation(
        tx,
        shop,
        me.customerId,
        '10:00',
        '11:00',
        'confirmed',
      );

      expect(await recordCustomerCancel(tx, cancelInput(made))).toBe(true);

      const [reservation] = await tx
        .select()
        .from(reservations)
        .where(eq(reservations.id, made.reservation.id));
      expect(reservation).toMatchObject({
        status: 'cancelled',
        cancelledAt: NOW,
        cancelActor: 'customer',
        hoursBeforeStartAtCancel: 30.5,
      });
      const [slot] = await tx.select().from(slots).where(eq(slots.id, made.slot.id));
      expect(slot.status).toBe('cancelled');
      const [order] = await tx.select().from(orders).where(eq(orders.id, made.order.id));
      expect(order.pgStatus).toBe('PARTIAL_CANCELLED');
      expect(
        await tx.select().from(refunds).where(eq(refunds.reservationId, made.reservation.id)),
      ).toMatchObject([
        {
          orderId: made.order.id,
          reason: 'customer_cancel',
          band: 'over_24h',
          penaltyRate: 30,
          refundAmount: 9_800,
          penaltyAmount: 4_200,
          pgCancellationId: 'c-1',
          processedAt: NOW,
        },
      ]);
    });
  });

  it('포트원을 부르지 않은 취소는 포트원 상태를 바꾸지 않는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const made = await createTestReservation(
        tx,
        shop,
        me.customerId,
        '10:00',
        '11:00',
        'confirmed',
      );
      await recordCustomerCancel(tx, { ...cancelInput(made), pgCancellationId: null });
      const [order] = await tx.select().from(orders).where(eq(orders.id, made.order.id));
      expect(order.pgStatus).toBeNull();
    });
  });

  it('두 번째 기록은 아무것도 바꾸지 않고 false(환불 기록은 한 줄)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const made = await createTestReservation(
        tx,
        shop,
        me.customerId,
        '10:00',
        '11:00',
        'confirmed',
      );
      expect(await recordCustomerCancel(tx, cancelInput(made))).toBe(true);
      expect(await recordCustomerCancel(tx, cancelInput(made))).toBe(false);
      expect(
        await tx.select().from(refunds).where(eq(refunds.reservationId, made.reservation.id)),
      ).toHaveLength(1);
    });
  });

  it('이용 완료한 예약은 취소로 바뀌지 않는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const made = await createTestReservation(
        tx,
        shop,
        me.customerId,
        '10:00',
        '11:00',
        'completed',
      );
      expect(await recordCustomerCancel(tx, cancelInput(made))).toBe(false);
      const [slot] = await tx.select().from(slots).where(eq(slots.id, made.slot.id));
      expect(slot.status).toBe('completed');
    });
  });
});
