// 합의 후 취소 요청 표와 새 값(마이그레이션 0012, #320·#308 ④)을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// - 답을 기다리는 요청은 한 예약에 하나(agreed_cancel_requests_pending_unique), 거절·만료 뒤에는 다시 요청할 수 있다
// - 취소 환불 기록(고객 취소·합의 후 취소)은 한 예약에 하나(refunds_cancel_unique)
// - 취소한 쪽 agreed, 환불 이유 agreed_cancel, 정산 줄 종류 agreed_cancel, 매물 마감 사유 hold_released

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { agreedCancelRequests, refunds, reservations, settlementItems, slots } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  type TestShop,
} from '../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../tests/db/test-db';

const NOW = new Date('2026-11-11T12:00:00+09:00');
const HOUR = 60 * 60 * 1000;

/** savepoint 안에서 돌려 막혔으면 어긴 제약 이름, 통과했으면 null. 바깥 트랜잭션은 계속 쓸 수 있다 */
async function violated(tx: TestTx, run: (t: TestTx) => Promise<unknown>) {
  try {
    await tx.transaction(async (t) => {
      await run(t);
    });
    return null;
  } catch (error) {
    const cause = (error as { cause?: unknown }).cause ?? error;
    return (cause as { constraint_name?: string }).constraint_name ?? String(cause);
  }
}

async function confirmedReservation(tx: TestTx, shop: TestShop, start = '09:00', end = '10:00') {
  const { customerId } = await createTestCustomer(tx);
  return createTestReservation(tx, shop, customerId, start, end, 'confirmed');
}

function request(
  reservationId: string,
  requestedBy: string,
  extra: Partial<typeof agreedCancelRequests.$inferInsert> = {},
) {
  return {
    reservationId,
    requestedBy,
    reason: 'style_mismatch',
    status: 'requested',
    requestedAt: NOW,
    expiresAt: new Date(NOW.getTime() + 24 * HOUR),
    ...extra,
  } satisfies typeof agreedCancelRequests.$inferInsert;
}

describeDb('합의 후 취소 요청과 새 값 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('답을 기다리는 요청은 한 예약에 하나, 거절 뒤에는 다시 요청할 수 있다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { reservation } = await confirmedReservation(tx, shop);
      const [first] = await tx
        .insert(agreedCancelRequests)
        .values(request(reservation.id, shop.createdBy))
        .returning({ id: agreedCancelRequests.id });

      expect(
        await violated(tx, (t) =>
          t.insert(agreedCancelRequests).values(request(reservation.id, shop.createdBy)),
        ),
      ).toBe('agreed_cancel_requests_pending_unique');

      await tx
        .update(agreedCancelRequests)
        .set({ status: 'declined', respondedAt: NOW })
        .where(eq(agreedCancelRequests.id, first.id));
      expect(
        await violated(tx, (t) =>
          t.insert(agreedCancelRequests).values(request(reservation.id, shop.createdBy)),
        ),
      ).toBeNull();
    });
  });

  it('사유·상태는 정해진 값만, 만료 시각은 요청 시각보다 뒤', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { reservation } = await confirmedReservation(tx, shop);
      const insert = (extra: Partial<typeof agreedCancelRequests.$inferInsert>) =>
        violated(tx, (t) =>
          t.insert(agreedCancelRequests).values(request(reservation.id, shop.createdBy, extra)),
        );
      expect(await insert({ reason: 'mood' })).toBe('agreed_cancel_requests_reason_check');
      expect(await insert({ status: 'pending' })).toBe('agreed_cancel_requests_status_check');
      expect(await insert({ expiresAt: NOW })).toBe('agreed_cancel_requests_expires_check');
      expect(
        await insert({ reason: 'other', reasonText: '손님이 다음에 오기로 했어요' }),
      ).toBeNull();
    });
  });

  it('취소 환불 기록은 고객 취소·합의 후 취소를 합쳐 한 예약에 하나', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { reservation, order } = await confirmedReservation(tx, shop);
      const refund = (reason: string) => ({
        orderId: order.id,
        reservationId: reservation.id,
        reason,
        status: 'requested',
        penaltyRate: 50,
        refundAmount: 7000,
        penaltyAmount: 7000,
      });
      await tx.insert(refunds).values(refund('agreed_cancel'));
      expect(await violated(tx, (t) => t.insert(refunds).values(refund('customer_cancel')))).toBe(
        'refunds_cancel_unique',
      );
      expect(await violated(tx, (t) => t.insert(refunds).values(refund('agreed_cancel')))).toBe(
        'refunds_cancel_unique',
      );
    });
  });

  it('취소한 쪽 agreed, 정산 줄 종류 agreed_cancel, 매물 마감 사유 hold_released를 저장할 수 있다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { reservation, order, slot } = await confirmedReservation(tx, shop);

      expect(
        await violated(tx, (t) =>
          t
            .update(reservations)
            .set({ status: 'cancelled', cancelActor: 'agreed', cancelledAt: NOW })
            .where(eq(reservations.id, reservation.id)),
        ),
      ).toBeNull();
      expect(
        await violated(tx, (t) =>
          t.insert(settlementItems).values({
            shopId: shop.shopId,
            orderId: order.id,
            kind: 'agreed_cancel',
            baseAmount: 7000,
            feeRate: 0,
            feeAmount: 0,
            feeVat: 0,
            paymentFeeRate: 0,
            paymentFee: 0,
            paymentFeeVat: 0,
            payoutAmount: 7000,
            pgFeeActual: 0,
          }),
        ),
      ).toBeNull();
      expect(
        await violated(tx, (t) =>
          t
            .update(slots)
            .set({ status: 'closed', closeReason: 'hold_released', closedAt: NOW })
            .where(eq(slots.id, slot.id)),
        ),
      ).toBeNull();
    });
  });
});
