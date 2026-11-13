// 원장님 정산 내역 DB 읽기(readShopSettlementRows, readOutstandingPenalty)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 정산 규칙과 금액 계산은 settle-rules.test.ts·settlement-view.test.ts가 본다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import {
  coupons,
  disputes,
  orders,
  ownerPenalties,
  refunds,
  settlementItems,
  settlements,
  type SettlementStatus,
} from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  type TestShop,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import { readOutstandingPenalty, readShopSettlementRows } from './settlement-store';

// 매물은 한국 시간 11/1(fixtures의 testSlot 날짜), 커트, 정가 20,000원·30% 할인·판매가 14,000원
const at = (value: string) => new Date(`${value}+09:00`);

/** 11/1 hh:00 서비스를 그 한 시간 뒤 방문 완료(또는 노쇼)로 처리한 예약 */
function completed(
  tx: TestTx,
  shop: TestShop,
  customerId: string,
  hour: number,
  visitResult: 'visited' | 'no_show' = 'visited',
  recordedAt = at(`2026-11-01T${String(hour + 1).padStart(2, '0')}:00:00`),
) {
  const hh = String(hour).padStart(2, '0');
  const end = String(hour + 1).padStart(2, '0');
  return createTestReservation(tx, shop, customerId, `${hh}:00`, `${end}:00`, 'completed', {
    visitResult,
    visitRecordedAt: recordedAt,
  });
}

/** 11/1 hh:00 서비스를 10/31 09:00에 취소한 예약 */
function cancelled(
  tx: TestTx,
  shop: TestShop,
  customerId: string,
  hour: number,
  cancelActor: 'customer' | 'agreed' | 'owner_fault',
) {
  const hh = String(hour).padStart(2, '0');
  const end = String(hour + 1).padStart(2, '0');
  return createTestReservation(tx, shop, customerId, `${hh}:00`, `${end}:00`, 'cancelled', {
    cancelActor,
    cancelledAt: at('2026-10-31T09:00:00'),
  });
}

type Made = Awaited<ReturnType<typeof createTestReservation>>;

function refund(
  tx: TestTx,
  made: Made,
  reason: 'customer_cancel' | 'agreed_cancel' | 'admin_exception',
  penaltyRate: number,
  status: 'requested' | 'done' = 'done',
) {
  return tx.insert(refunds).values({
    orderId: made.order.id,
    reservationId: made.reservation.id,
    reason,
    status,
    penaltyRate,
    refundAmount: 0,
    penaltyAmount: 0,
    processedAt: status === 'done' ? at('2026-10-31T09:00:00') : null,
  });
}

/** 묶음 하나(지급일 periodEnd)와 그 안의 정산 줄 하나 */
async function settle(
  tx: TestTx,
  shop: TestShop,
  made: Made,
  status: SettlementStatus,
  periodEnd: string,
) {
  const [settlement] = await tx
    .insert(settlements)
    .values({
      shopId: shop.shopId,
      periodStart: '2026-10-30',
      periodEnd,
      itemCount: 1,
      totalBaseAmount: 14_000,
      totalFeeAmount: 0,
      penaltyDeducted: 0,
      payoutAmount: 13_538,
      status,
    })
    .returning();
  await tx.insert(settlementItems).values({
    shopId: shop.shopId,
    orderId: made.order.id,
    kind: 'sale',
    baseAmount: 14_000,
    feeRate: 0,
    feeAmount: 0,
    feeVat: 0,
    paymentFeeRate: 3.3,
    paymentFee: 420,
    paymentFeeVat: 42,
    payoutAmount: 13_538,
    pgFeeActual: 0,
    settlementId: settlement.id,
  });
}

const DAY = { from: at('2026-11-01T00:00:00'), to: at('2026-11-02T00:00:00') };

describeDb('원장님 정산 내역 읽기 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('내 샵의 끝난 예약 중 처리·취소 시각이 기간 안인 것만 읽고, 예정 예약과 다른 샵은 뺀다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const other = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const visited = await completed(tx, shop, customerId, 9);
      const noShow = await completed(tx, shop, customerId, 10, 'no_show');
      // 11/3에 늦게 처리한 방문은 11/1 기간에 들어가지 않는다
      await completed(tx, shop, customerId, 11, 'visited', at('2026-11-03T10:00:00'));
      // 10/31에 취소한 예약은 11/1 기간에 들어가지 않는다
      await cancelled(tx, shop, customerId, 12, 'customer');
      await createTestReservation(tx, shop, customerId, '13:00', '14:00', 'confirmed');
      await completed(tx, other, customerId, 9);

      const rows = await readShopSettlementRows(tx, { shopId: shop.shopId, occurred: DAY });
      // 처리 시각이 늦은 것부터
      expect(rows.map((row) => row.reservationId)).toEqual([
        noShow.reservation.id,
        visited.reservation.id,
      ]);
      expect(rows[1]).toEqual({
        reservationId: visited.reservation.id,
        reservationCode: visited.reservation.code,
        status: 'completed',
        visitResult: 'visited',
        visitRecordedAt: at('2026-11-01T10:00:00'),
        cancelledAt: null,
        cancelActor: null,
        startAt: at('2026-11-01T09:00:00'),
        menuName: '커트',
        listPrice: 20_000,
        salePrice: 14_000,
        discountRate: 30,
        couponUsed: false,
        cancelPenaltyRate: null,
        hasAdminRefund: false,
        hasOpenDispute: false,
        openDisputeReceivedAt: null,
        ownerPenalty: null,
        item: null,
      });

      const all = await readShopSettlementRows(tx, { shopId: shop.shopId });
      expect(all).toHaveLength(4);
    });
  });

  it('끝난 고객 취소·합의 후 취소 환불의 위약금 비율만 읽고, 진행 중 환불과 원장님 귀책은 비운다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const customer = await cancelled(tx, shop, customerId, 9, 'customer');
      const agreed = await cancelled(tx, shop, customerId, 10, 'agreed');
      const inProgress = await cancelled(tx, shop, customerId, 11, 'customer');
      const ownerFault = await cancelled(tx, shop, customerId, 12, 'owner_fault');
      await refund(tx, customer, 'customer_cancel', 30);
      await refund(tx, agreed, 'agreed_cancel', 50);
      await refund(tx, inProgress, 'customer_cancel', 50, 'requested');

      const rows = await readShopSettlementRows(tx, { shopId: shop.shopId });
      const rateOf = (made: Made) =>
        rows.find((row) => row.reservationId === made.reservation.id)?.cancelPenaltyRate;
      expect(rateOf(customer)).toBe(30);
      expect(rateOf(agreed)).toBe(50);
      expect(rateOf(inProgress)).toBeNull();
      expect(rateOf(ownerFault)).toBeNull();
    });
  });

  it('운영자 취소 환불이 있으면 hasAdminRefund, 확인 중 이의제기만 hasOpenDispute와 받은 시각', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const adminRefunded = await completed(tx, shop, customerId, 9);
      const openDispute = await completed(tx, shop, customerId, 10);
      const resolvedDispute = await completed(tx, shop, customerId, 11);
      await refund(tx, adminRefunded, 'admin_exception', 0);
      await tx.insert(disputes).values([
        {
          reservationId: openDispute.reservation.id,
          type: 'after_start',
          content: '테스트 이의제기 내용이에요',
          status: 'open',
          channel: 'app',
          receivedAt: at('2026-11-02T10:00:00'),
        },
        {
          reservationId: resolvedDispute.reservation.id,
          type: 'after_start',
          content: '테스트 이의제기 내용이에요',
          status: 'resolved',
          channel: 'app',
          receivedAt: new Date(),
          outcome: 'no_change',
        },
      ]);

      const rows = await readShopSettlementRows(tx, { shopId: shop.shopId });
      const flagsOf = (made: Made) => {
        const row = rows.find((r) => r.reservationId === made.reservation.id);
        return {
          admin: row?.hasAdminRefund,
          open: row?.hasOpenDispute,
          receivedAt: row?.openDisputeReceivedAt,
        };
      };
      expect(flagsOf(adminRefunded)).toEqual({ admin: true, open: false, receivedAt: null });
      expect(flagsOf(openDispute)).toEqual({
        admin: false,
        open: true,
        receivedAt: at('2026-11-02T10:00:00'),
      });
      expect(flagsOf(resolvedDispute)).toEqual({ admin: false, open: false, receivedAt: null });
    });
  });

  it('묶인 정산 줄과 묶음 상태·지급일을 읽고, unpaidOnly는 지급 완료·실패 묶음을 뺀다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const paid = await completed(tx, shop, customerId, 9);
      const requested = await completed(tx, shop, customerId, 10);
      const failed = await completed(tx, shop, customerId, 11);
      const notSettled = await completed(tx, shop, customerId, 12);
      await settle(tx, shop, paid, 'paid', '2026-11-05');
      await settle(tx, shop, requested, 'requested', '2026-11-12');
      await settle(tx, shop, failed, 'failed', '2026-11-13');

      const rows = await readShopSettlementRows(tx, { shopId: shop.shopId });
      const paidRow = rows.find((row) => row.reservationId === paid.reservation.id);
      expect(paidRow?.item).toEqual({
        kind: 'sale',
        baseAmount: 14_000,
        feeRate: 0,
        feeAmount: 0,
        feeVat: 0,
        paymentFeeRate: 3.3,
        paymentFee: 420,
        paymentFeeVat: 42,
        payoutAmount: 13_538,
        settlement: { status: 'paid', payoutDate: '2026-11-05' },
      });

      const unpaid = await readShopSettlementRows(tx, { shopId: shop.shopId, unpaidOnly: true });
      expect(unpaid.map((row) => row.reservationId).sort()).toEqual(
        [requested.reservation.id, notSettled.reservation.id].sort(),
      );
    });
  });

  it('쿠폰을 쓴 주문이면 couponUsed, 원장님 귀책 취소면 그 예약의 패널티와 걷은 금액을 읽는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const withCoupon = await completed(tx, shop, customerId, 9);
      const ownerFault = await cancelled(tx, shop, customerId, 10, 'owner_fault');
      const [coupon] = await tx
        .insert(coupons)
        .values({
          customerId,
          amount: 3_000,
          reason: 'owner_fault_compensation',
          issuedAt: at('2026-10-20T10:00:00'),
          expiresAt: at('2027-01-18T10:00:00'),
        })
        .returning();
      await tx
        .update(orders)
        .set({ couponId: coupon.id, couponAmount: 3_000, amount: 11_000 })
        .where(eq(orders.id, withCoupon.order.id));
      await tx.insert(ownerPenalties).values({
        shopId: shop.shopId,
        reservationId: ownerFault.reservation.id,
        amount: 5_000,
        collectedAmount: 2_000,
      });

      const rows = await readShopSettlementRows(tx, { shopId: shop.shopId });
      const rowOf = (made: Made) => rows.find((row) => row.reservationId === made.reservation.id);
      expect(rowOf(withCoupon)).toMatchObject({ couponUsed: true, ownerPenalty: null });
      expect(rowOf(ownerFault)).toMatchObject({
        couponUsed: false,
        cancelActor: 'owner_fault',
        ownerPenalty: { amount: 5_000, collectedAmount: 2_000 },
      });
    });
  });

  it('readOutstandingPenalty: 다 걷지 못한 패널티의 남은 금액만 더한다(다른 샵·다 걷은 것 제외)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const other = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const first = await cancelled(tx, shop, customerId, 9, 'owner_fault');
      const second = await cancelled(tx, shop, customerId, 10, 'owner_fault');
      const third = await cancelled(tx, shop, customerId, 11, 'owner_fault');
      const elsewhere = await cancelled(tx, other, customerId, 9, 'owner_fault');
      await tx.insert(ownerPenalties).values([
        {
          shopId: shop.shopId,
          reservationId: first.reservation.id,
          amount: 5_000,
          collectedAmount: 2_000,
        },
        { shopId: shop.shopId, reservationId: second.reservation.id, amount: 5_000 },
        {
          shopId: shop.shopId,
          reservationId: third.reservation.id,
          amount: 5_000,
          collectedAmount: 5_000,
          fullyCollectedAt: at('2026-11-05T10:00:00'),
        },
        { shopId: other.shopId, reservationId: elsewhere.reservation.id, amount: 5_000 },
      ]);

      expect(await readOutstandingPenalty(tx, shop.shopId)).toBe(8_000);
      const empty = await createTestShop(tx, { status: 'approved' });
      expect(await readOutstandingPenalty(tx, empty.shopId)).toBe(0);
    });
  });
});
