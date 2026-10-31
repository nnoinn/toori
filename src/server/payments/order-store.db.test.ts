// 주문 저장(createPendingOrder, W11 ①)을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 결제 대기 주문 한 줄에 동의 2개(환불 규정, 예약자 정보 제공)의 버전과 시각이 남는지, 결제 번호가 겹치면 막히는지 본다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { orders, slots } from '@/db/schema';
import { CHECKOUT_CONSENT_VERSIONS } from '@/server/policy';

import { createTestCustomer, createTestShop, testSlot } from '../../../tests/db/fixtures';
import {
  closeTestDb,
  describeDb,
  type TestTx,
  violatedConstraint,
  withRollback,
} from '../../../tests/db/test-db';
import { createPendingOrder, newPaymentId } from './order-store';

const AGREED_AT = new Date('2026-11-01T09:00:00+09:00');

async function setup(tx: TestTx) {
  const shop = await createTestShop(tx, { status: 'approved' });
  const { customerId } = await createTestCustomer(tx);
  const [slot] = await tx
    .insert(slots)
    .values(testSlot(shop, '10:00', '11:00'))
    .returning();
  return { slotId: slot.id, customerId };
}

describeDb('주문 저장 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('결제 대기 주문에 금액과 동의 2개의 버전·시각을 남긴다', async () => {
    await withRollback(async (tx) => {
      const { slotId, customerId } = await setup(tx);
      const paymentId = newPaymentId();
      const orderId = await createPendingOrder(tx, {
        paymentId,
        slotId,
        customerId,
        salePrice: 14_000,
        couponAmount: 0,
        amount: 14_000,
        agreedAt: AGREED_AT,
      });
      const [row] = await tx.select().from(orders).where(eq(orders.id, orderId));
      expect(row).toMatchObject({
        paymentId,
        slotId,
        customerId,
        salePrice: 14_000,
        couponAmount: 0,
        amount: 14_000,
        status: 'pending',
        refundPolicyVersion: CHECKOUT_CONSENT_VERSIONS.refundPolicy,
        refundPolicyAgreedAt: AGREED_AT,
        bookerInfoVersion: CHECKOUT_CONSENT_VERSIONS.bookerInfo,
        bookerInfoAgreedAt: AGREED_AT,
        paidAt: null,
        pgStatus: null,
      });
    });
  });

  it('같은 결제 번호로 두 번 저장하면 막힌다', async () => {
    await withRollback(async (tx) => {
      const { slotId, customerId } = await setup(tx);
      const order = {
        paymentId: newPaymentId(),
        slotId,
        customerId,
        salePrice: 14_000,
        couponAmount: 0,
        amount: 14_000,
        agreedAt: AGREED_AT,
      };
      await createPendingOrder(tx, order);
      expect(await violatedConstraint(tx, (t) => createPendingOrder(t, order))).toBe(
        'orders_payment_id_unique',
      );
    });
  });
});
