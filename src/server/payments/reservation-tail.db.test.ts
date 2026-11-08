// 예약번호 끝 4자리 겹침 막기(#262)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 번호 만들기를 정해 둔 순서로 바꿔서, 같은 샵의 예정 예약과 끝 4자리가 같으면 새로 뽑는지 본다.

import { afterAll, beforeEach, expect, it, vi } from 'vitest';

import { slots } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  type TestShop,
  testSlot,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';

const state = vi.hoisted(() => ({ codes: [] as string[] }));

vi.mock('./reservation-code', async (original) => ({
  ...(await original<typeof import('./reservation-code')>()),
  newReservationCode: () => {
    const code = state.codes.shift();
    if (!code) throw new Error('테스트 예약번호가 모자라요');
    return code;
  },
}));

const { confirmPaidOrder } = await import('./confirm-store');
const { createPendingOrder, newPaymentId } = await import('./order-store');

const NOW = new Date('2026-11-01T09:00:00+09:00');
const PAID = { pgStatus: 'PAID', payMethod: 'PaymentMethodCard', paidAt: NOW };

/** 이 샵의 11:00 매물을 새 고객이 홀딩하고 결제 대기 주문을 만든 상태 */
async function heldOrder(tx: TestTx, shop: TestShop) {
  const { customerId } = await createTestCustomer(tx);
  const [slot] = await tx
    .insert(slots)
    .values(
      testSlot(shop, '11:00', '12:00', {
        holdCustomerId: customerId,
        holdExpiresAt: new Date(NOW.getTime() + 10 * 60 * 1000),
      }),
    )
    .returning();
  return createPendingOrder(tx, {
    paymentId: newPaymentId(),
    slotId: slot.id,
    customerId,
    salePrice: 14_000,
    couponAmount: 0,
    amount: 14_000,
    agreedAt: NOW,
  });
}

/** 이 샵에 끝 4자리가 1234인 예약을 하나 둔다 */
async function existing(tx: TestTx, shop: TestShop, status: 'confirmed' | 'cancelled') {
  const { customerId } = await createTestCustomer(tx);
  await createTestReservation(tx, shop, customerId, '10:00', '11:00', status, {
    code: `${crypto.randomUUID().replace(/\D/g, '').padEnd(8, '0').slice(0, 8)}1234`,
  });
}

async function confirmedCode(tx: TestTx, orderId: string) {
  const result = await confirmPaidOrder(tx, { orderId, ...PAID });
  if (!result.ok) throw new Error('확정 실패');
  return result.reservationCode;
}

beforeEach(() => {
  state.codes = [];
});

describeDb('예약번호 끝 4자리 겹침 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('같은 샵의 예정 예약과 끝 4자리가 같으면 새로 뽑는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      await existing(tx, shop, 'confirmed');
      const orderId = await heldOrder(tx, shop);
      state.codes = ['900000001234', '900000005678'];
      expect(await confirmedCode(tx, orderId)).toBe('900000005678');
    });
  });

  it('취소된 예약이나 다른 샵의 예약과는 겹쳐도 된다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const other = await createTestShop(tx, { status: 'approved' });
      await existing(tx, shop, 'cancelled');
      await existing(tx, other, 'confirmed');
      const orderId = await heldOrder(tx, shop);
      state.codes = ['900000011234'];
      expect(await confirmedCode(tx, orderId)).toBe('900000011234');
    });
  });

  it('끝까지 겹치면 마지막 번호로 그대로 넣는다(결제는 끝났다)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      await existing(tx, shop, 'confirmed');
      const orderId = await heldOrder(tx, shop);
      state.codes = Array.from({ length: 5 }, (_, i) => `9000000${i}1234`);
      const last = state.codes.at(-1);
      expect(await confirmedCode(tx, orderId)).toBe(last);
      expect(state.codes).toEqual([]);
    });
  });
});
