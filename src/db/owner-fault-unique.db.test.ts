// 원장님 귀책 취소 DB 조건 (마이그레이션 0018, #419, X-207). 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// - 한 예약에 취소 환불(고객 취소·합의 후 취소·원장님 귀책 취소)은 하나만
// - 원장님 귀책 보상 쿠폰은 원인 예약 하나에 한 장만

import { afterAll, expect, it } from 'vitest';

import { coupons, refunds } from '@/db/schema';
import { requestCancelRefund } from '@/server/refunds/refund-store';

import { createTestCustomer, createTestReservation, createTestShop } from '../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../tests/db/test-db';

/** savepoint 안에서 돌려 막혔으면 제약 이름, 통과했으면 null. 바깥 트랜잭션은 계속 쓸 수 있다 */
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

const AT = new Date('2026-11-16T10:00:00+09:00');

async function booking(tx: TestTx, start: string, end: string) {
  const shop = await createTestShop(tx, { status: 'approved' });
  const { customerId } = await createTestCustomer(tx);
  const made = await createTestReservation(tx, shop, customerId, start, end, 'confirmed');
  return { ...made, customerId };
}

function refund(
  made: Awaited<ReturnType<typeof booking>>,
  reason: string,
): typeof refunds.$inferInsert {
  return {
    orderId: made.order.id,
    reservationId: made.reservation.id,
    reason,
    status: 'requested',
    penaltyRate: 0,
    refundAmount: made.order.amount,
    penaltyAmount: 0,
  };
}

describeDb('원장님 귀책 취소 DB 조건 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('한 예약에 고객 취소·합의 후 취소·원장님 귀책 취소 환불은 합쳐서 하나만(같은 순간 눌러도 환불은 한 번)', async () => {
    await withRollback(async (tx) => {
      const first = await booking(tx, '09:00', '10:00');
      await tx.insert(refunds).values(refund(first, 'customer_cancel'));
      expect(
        await violated(tx, (t) => t.insert(refunds).values(refund(first, 'owner_fault'))),
      ).toBe('refunds_cancel_unique');

      const second = await booking(tx, '10:00', '11:00');
      await tx.insert(refunds).values(refund(second, 'owner_fault'));
      for (const reason of ['owner_fault', 'customer_cancel', 'agreed_cancel']) {
        expect(
          await violated(tx, (t) => t.insert(refunds).values(refund(second, reason))),
          reason,
        ).toBe('refunds_cancel_unique');
      }
      // 운영자 환불 예외는 취소 환불과 따로라 같은 예약에도 남길 수 있다
      expect(
        await violated(tx, (t) =>
          t
            .insert(refunds)
            .values({ ...refund(second, 'admin_exception'), status: 'done', processedAt: AT }),
        ),
      ).toBeNull();
    });
  });

  it('원장님 귀책 취소 환불이 먼저 있으면 고객 취소 진행 중 기록은 넣지 않는다(ON CONFLICT가 넓힌 인덱스를 찾는다)', async () => {
    await withRollback(async (tx) => {
      const made = await booking(tx, '09:00', '10:00');
      await tx.insert(refunds).values(refund(made, 'owner_fault'));
      const requested = await requestCancelRefund(tx, {
        reservationId: made.reservation.id,
        orderId: made.order.id,
        reason: 'customer_cancel',
        band: 'over_24h',
        penaltyRate: 30,
        refundAmount: 9_800,
        penaltyAmount: 4_200,
        requestedAt: AT,
      });
      expect(requested).toBe(false);

      // 원장님 귀책 취소가 없는 예약은 그대로 넣는다
      const other = await booking(tx, '10:00', '11:00');
      expect(
        await requestCancelRefund(tx, {
          reservationId: other.reservation.id,
          orderId: other.order.id,
          reason: 'customer_cancel',
          band: 'over_24h',
          penaltyRate: 30,
          refundAmount: 9_800,
          penaltyAmount: 4_200,
          requestedAt: AT,
        }),
      ).toBe(true);
    });
  });

  it('원장님 귀책 보상 쿠폰은 원인 예약 하나에 한 장(다른 예약이면 따로 받는다)', async () => {
    await withRollback(async (tx) => {
      const made = await booking(tx, '09:00', '10:00');
      const other = await booking(tx, '10:00', '11:00');
      const coupon = (reservationId: string, customerId: string) => ({
        customerId,
        amount: 3_000,
        reason: 'owner_fault_compensation',
        sourceReservationId: reservationId,
        issuedAt: AT,
        expiresAt: new Date(AT.getTime() + 90 * 24 * 60 * 60 * 1000),
      });

      await tx.insert(coupons).values(coupon(made.reservation.id, made.customerId));
      expect(
        await violated(tx, (t) =>
          t.insert(coupons).values(coupon(made.reservation.id, made.customerId)),
        ),
      ).toBe('coupons_compensation_unique');
      expect(
        await violated(tx, (t) =>
          t.insert(coupons).values(coupon(other.reservation.id, other.customerId)),
        ),
      ).toBeNull();
    });
  });
});
