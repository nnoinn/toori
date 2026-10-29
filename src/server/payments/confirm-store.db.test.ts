// 결제 확인 저장(confirmPaidOrder, readMyOrder, recordOrderOutcome, W11 ②)을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 동시에 두 번 확인하는 경우는 confirm-concurrency.db.test.ts가 본다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { orders, reservations, slots } from '@/db/schema';

import { createTestCustomer, createTestShop, testSlot } from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import { confirmPaidOrder, readMyOrder, recordOrderOutcome } from './confirm-store';
import { createPendingOrder, newPaymentId } from './order-store';
import { RESERVATION_CODE_PATTERN } from './reservation-code';

const NOW = new Date('2026-11-01T09:00:00+09:00');
const MINUTE = 60 * 1000;
const at = (minutes: number) => new Date(NOW.getTime() + minutes * MINUTE);

/** 승인 샵의 게시중 매물을 이 고객이 10분 홀딩하고 결제 대기 주문을 만든 상태 */
async function heldAndOrdered(tx: TestTx, slotExtra: Partial<typeof slots.$inferInsert> = {}) {
  const shop = await createTestShop(tx, { status: 'approved' });
  const { customerId } = await createTestCustomer(tx);
  const [slot] = await tx
    .insert(slots)
    .values(
      testSlot(shop, '10:00', '11:00', {
        holdCustomerId: customerId,
        holdExpiresAt: at(10),
        ...slotExtra,
      }),
    )
    .returning();
  const paymentId = newPaymentId();
  const orderId = await createPendingOrder(tx, {
    paymentId,
    slotId: slot.id,
    customerId,
    salePrice: 14_000,
    couponAmount: 0,
    amount: 14_000,
    agreedAt: NOW,
  });
  return { customerId, slotId: slot.id, paymentId, orderId };
}

const paidAt = (minutes: number) => ({
  pgStatus: 'PAID',
  payMethod: 'PaymentMethodCard',
  paidAt: at(minutes),
});

describeDb('결제 확인 저장 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('홀딩 시간 안에 결제했으면 예약 만들기·주문 확정·매물 예약됨·홀딩 비우기를 한 번에 한다', async () => {
    await withRollback(async (tx) => {
      const { customerId, slotId, orderId } = await heldAndOrdered(tx);
      const result = await confirmPaidOrder(tx, { orderId, ...paidAt(3) });
      if (!result.ok) throw new Error('확정 실패');
      expect(result.reservationCode).toMatch(RESERVATION_CODE_PATTERN);

      const [reservation] = await tx
        .select()
        .from(reservations)
        .where(eq(reservations.id, result.reservationId));
      expect(reservation).toMatchObject({ slotId, orderId, customerId, status: 'confirmed' });
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId));
      expect(order).toMatchObject({
        status: 'confirmed',
        pgStatus: 'PAID',
        payMethod: 'PaymentMethodCard',
        paidAt: at(3),
        failureCode: null,
      });
      const [slot] = await tx.select().from(slots).where(eq(slots.id, slotId));
      expect(slot).toMatchObject({ status: 'reserved', holdCustomerId: null, holdExpiresAt: null });
    });
  });

  it('이미 확정된 주문을 다시 확인하면 같은 예약을 돌려주고 더 만들지 않는다', async () => {
    await withRollback(async (tx) => {
      const { slotId, orderId } = await heldAndOrdered(tx);
      const first = await confirmPaidOrder(tx, { orderId, ...paidAt(3) });
      expect(await confirmPaidOrder(tx, { orderId, ...paidAt(3) })).toEqual(first);
      const rows = await tx.select().from(reservations).where(eq(reservations.slotId, slotId));
      expect(rows).toHaveLength(1);
    });
  });

  it('홀딩이 끝난 뒤 결제됐으면 확정하지 않고 주문을 결제 확인(paid)·HOLD_EXPIRED로 기록한다', async () => {
    await withRollback(async (tx) => {
      const { slotId, orderId, customerId } = await heldAndOrdered(tx);
      expect(await confirmPaidOrder(tx, { orderId, ...paidAt(11) })).toEqual({
        ok: false,
        code: 'HOLD_EXPIRED',
      });
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId));
      expect(order).toMatchObject({ status: 'paid', failureCode: 'HOLD_EXPIRED', paidAt: at(11) });
      const [slot] = await tx.select().from(slots).where(eq(slots.id, slotId));
      expect(slot).toMatchObject({ status: 'published', holdCustomerId: customerId });
      expect(await tx.select().from(reservations).where(eq(reservations.slotId, slotId))).toEqual(
        [],
      );
      // 한 번 기록된 뒤 다시 확인해도 같은 답
      expect(await confirmPaidOrder(tx, { orderId, ...paidAt(11) })).toEqual({
        ok: false,
        code: 'HOLD_EXPIRED',
      });
    });
  });

  it('홀딩이 끝나 다른 고객이 다시 홀딩한 매물이면 HOLD_EXPIRED', async () => {
    await withRollback(async (tx) => {
      const other = await createTestCustomer(tx);
      const { orderId } = await heldAndOrdered(tx, {
        holdCustomerId: other.customerId,
        holdExpiresAt: at(20),
      });
      expect(await confirmPaidOrder(tx, { orderId, ...paidAt(15) })).toEqual({
        ok: false,
        code: 'HOLD_EXPIRED',
      });
    });
  });

  it('이미 팔린 매물이면 SLOT_SOLD', async () => {
    await withRollback(async (tx) => {
      const { orderId } = await heldAndOrdered(tx, { status: 'reserved' });
      expect(await confirmPaidOrder(tx, { orderId, ...paidAt(3) })).toEqual({
        ok: false,
        code: 'SLOT_SOLD',
      });
    });
  });

  it('readMyOrder는 내 주문만 읽고, 확정되면 예약을 같이 준다', async () => {
    await withRollback(async (tx) => {
      const { customerId, slotId, paymentId, orderId } = await heldAndOrdered(tx);
      expect(await readMyOrder(tx, paymentId, customerId)).toEqual({
        orderId,
        slotId,
        amount: 14_000,
        status: 'pending',
        pgStatus: null,
        failureCode: null,
        reservation: null,
      });
      const other = await createTestCustomer(tx);
      expect(await readMyOrder(tx, paymentId, other.customerId)).toBeNull();
      expect(await readMyOrder(tx, newPaymentId(), customerId)).toBeNull();

      const confirmed = await confirmPaidOrder(tx, { orderId, ...paidAt(3) });
      expect(await readMyOrder(tx, paymentId, customerId)).toMatchObject({
        status: 'confirmed',
        reservation: confirmed.ok
          ? { reservationId: confirmed.reservationId, reservationCode: confirmed.reservationCode }
          : null,
      });
    });
  });

  it('recordOrderOutcome은 결제 대기 주문에만 기록한다(확정된 주문은 그대로)', async () => {
    await withRollback(async (tx) => {
      const { orderId } = await heldAndOrdered(tx);
      expect(
        await recordOrderOutcome(tx, orderId, {
          status: 'failed',
          pgStatus: 'FAILED',
          failureCode: 'FAILED',
          failureMessage: '카드 한도 초과',
        }),
      ).toBe(true);
      const [failed] = await tx.select().from(orders).where(eq(orders.id, orderId));
      expect(failed).toMatchObject({ status: 'failed', failureMessage: '카드 한도 초과' });

      const second = await heldAndOrdered(tx, {});
      await confirmPaidOrder(tx, { orderId: second.orderId, ...paidAt(3) });
      expect(
        await recordOrderOutcome(tx, second.orderId, {
          status: 'failed',
          pgStatus: 'FAILED',
          failureCode: 'FAILED',
        }),
      ).toBe(false);
      const [still] = await tx.select().from(orders).where(eq(orders.id, second.orderId));
      expect(still.status).toBe('confirmed');
    });
  });
});
