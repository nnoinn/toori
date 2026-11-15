// 목요일 정산 묶기(runSettlementBatch)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 처음부터 끝까지 확인한다 (#353, W20 ③).
// 묶을 거래 고르기(종류·기한·보류), 정산 묶음·줄·패널티 저장, 0원 정산, 다시 돌려도 두 번 묶지 않기,
// 지급일 다음 날 따라잡기, 묶기 후보 줄이기(#394 리뷰 2·3번)를 본다.
// 금액 기댓값은 docs/settlement-examples.md 3장(정가 50,000원 10% 할인, 결제 수수료 3.0% 가정).

import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import {
  disputes,
  orders,
  ownerPenalties,
  penaltyCollections,
  refunds,
  reservations,
  settlementItems,
  settlements,
  slots,
} from '@/db/schema';
import type { ReservationStatus } from '@/db/schema/payments';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  createTestUser,
  type TestShop,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import { runSettlementBatch } from './batch';
import { readBatchCandidates } from './batch-store';

type Db = Parameters<typeof runSettlementBatch>[0];

const kst = (date: string, hm: string) => new Date(`${date}T${hm}:00+09:00`);
/** 지급일 2026-11-05(목) 0시 30분. 11/01(일) 서비스는 영업일 48시간(11/04 0시)이 지나서 이날 묶인다 */
const PAYOUT_NOW = kst('2026-11-05', '00:30');
const PAYMENT_FEE_RATE = 3;

/** 정산 예시 3장 매물로 바꾼 끝난 예약(판매가 45,000원, 10% 할인, 쿠폰 없음) */
async function finished(
  tx: TestTx,
  shop: TestShop,
  start: string,
  end: string,
  status: ReservationStatus,
  extra: Partial<typeof reservations.$inferInsert> = {},
) {
  const { customerId } = await createTestCustomer(tx);
  const made = await createTestReservation(tx, shop, customerId, start, end, status, extra);
  await tx
    .update(slots)
    .set({ listPrice: 50_000, discountRate: 10, salePrice: 45_000 })
    .where(eq(slots.id, made.slot.id));
  await tx
    .update(orders)
    .set({ salePrice: 45_000, amount: 45_000 })
    .where(eq(orders.id, made.order.id));
  return made;
}

const visited = (at: Date) => ({ visitResult: 'visited' as const, visitRecordedAt: at });

async function customerCancel(tx: TestTx, shop: TestShop, start: string, end: string) {
  const made = await finished(tx, shop, start, end, 'cancelled', {
    cancelActor: 'customer',
    cancelledAt: kst('2026-10-31', '10:00'),
  });
  await tx.insert(refunds).values({
    orderId: made.order.id,
    reservationId: made.reservation.id,
    reason: 'customer_cancel',
    status: 'done',
    band: 'over_24h',
    penaltyRate: 30,
    refundAmount: 31_500,
    penaltyAmount: 13_500,
    processedAt: kst('2026-10-31', '10:00'),
  });
  return made;
}

/** 원장님 귀책 취소 예약과 그 패널티 5,000원 */
async function ownerFaultPenalty(
  tx: TestTx,
  shop: TestShop,
  start: string,
  end: string,
  createdAt: Date,
) {
  const made = await finished(tx, shop, start, end, 'cancelled', {
    cancelActor: 'owner_fault',
    cancelledAt: kst('2026-10-30', '10:00'),
  });
  const [row] = await tx
    .insert(ownerPenalties)
    .values({ shopId: shop.shopId, reservationId: made.reservation.id, amount: 5_000, createdAt })
    .returning({ id: ownerPenalties.id });
  return row.id;
}

async function settlementsOf(tx: TestTx, shopId: string) {
  return tx.select().from(settlements).where(eq(settlements.shopId, shopId));
}

describeDb('목요일 정산 묶기 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('기한이 지났고 이의제기 중이 아닌 끝난 거래만 샵별로 묶고, 남은 패널티를 떼며, 다시 돌려도 두 번 묶지 않는다', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const shop = await createTestShop(tx, { status: 'approved' });
      const sale = await finished(
        tx,
        shop,
        '09:00',
        '10:00',
        'completed',
        visited(kst('2026-11-01', '11:00')),
      );
      const noShow = await finished(tx, shop, '10:00', '11:00', 'completed', {
        visitResult: 'no_show',
        visitRecordedAt: kst('2026-11-01', '11:00'),
      });
      const cancel = await customerCancel(tx, shop, '11:00', '12:00');
      // 묶이지 않는 것: 이의제기 중, 기한이 아직(수요일 처리 → 금요일 기한), 운영자 취소, 예정 예약
      const held = await finished(
        tx,
        shop,
        '12:00',
        '13:00',
        'completed',
        visited(kst('2026-11-01', '13:00')),
      );
      await tx.insert(disputes).values({
        reservationId: held.reservation.id,
        type: 'after_start',
        content: '시술이 약속과 달랐어요',
        status: 'open',
        channel: 'app',
        receivedAt: kst('2026-11-02', '10:00'),
      });
      const late = await finished(
        tx,
        shop,
        '13:00',
        '14:00',
        'completed',
        visited(kst('2026-11-04', '10:00')),
      );
      const admin = await finished(tx, shop, '14:00', '15:00', 'cancelled', {
        cancelActor: 'admin',
        cancelledAt: kst('2026-11-01', '15:00'),
      });
      await tx.insert(refunds).values({
        orderId: admin.order.id,
        reservationId: admin.reservation.id,
        reason: 'admin_exception',
        status: 'done',
        penaltyRate: 0,
        refundAmount: 45_000,
        penaltyAmount: 0,
        processedAt: kst('2026-11-01', '15:00'),
      });
      const upcoming = await finished(tx, shop, '15:00', '16:00', 'confirmed');
      const penaltyId = await ownerFaultPenalty(
        tx,
        shop,
        '16:00',
        '17:00',
        kst('2026-10-30', '10:00'),
      );

      const result = await runSettlementBatch(db, {
        now: PAYOUT_NOW,
        paymentFeeRate: PAYMENT_FEE_RATE,
        mode: 'launch',
      });
      expect(result).toMatchObject({ status: 'done', payoutDate: '2026-11-05', failed: 0 });

      const [settlement] = await settlementsOf(tx, shop.shopId);
      expect(settlement).toMatchObject({
        // 처음 묶이는 거래가 끝난 날(고객 취소 10/31)부터 지급일까지
        periodStart: '2026-10-31',
        periodEnd: '2026-11-05',
        itemCount: 3,
        totalBaseAmount: 45_000 + 45_000 + 13_500,
        totalFeeAmount: 1_485 + 1_485 + 445,
        penaltyDeducted: 5_000,
        payoutAmount: 43_515 + 43_515 + 13_055 - 5_000,
        status: 'pending',
        paidAt: null,
        payoutRef: null,
        memo: null,
      });
      const items = await tx
        .select()
        .from(settlementItems)
        .where(eq(settlementItems.shopId, shop.shopId));
      expect(
        new Map(
          items.map((row) => [
            row.orderId,
            [
              row.kind,
              row.baseAmount,
              row.payoutAmount,
              row.paymentFeeRate,
              row.pgFeeActual,
              row.couponAmount,
              row.settlementId,
            ],
          ]),
        ),
      ).toEqual(
        new Map([
          [sale.order.id, ['sale', 45_000, 43_515, 3, null, 0, settlement.id]],
          [noShow.order.id, ['no_show', 45_000, 43_515, 3, null, 0, settlement.id]],
          [cancel.order.id, ['penalty', 13_500, 13_055, 3, null, 0, settlement.id]],
        ]),
      );
      const notBatched = [held, late, admin, upcoming].map((made) => made.order.id);
      expect(
        await tx.select().from(settlementItems).where(inArray(settlementItems.orderId, notBatched)),
      ).toEqual([]);
      const [collected] = await tx
        .select()
        .from(ownerPenalties)
        .where(eq(ownerPenalties.id, penaltyId));
      expect([collected.collectedAmount, collected.fullyCollectedAt]).toEqual([5_000, PAYOUT_NOW]);
      expect(
        await tx
          .select({
            amount: penaltyCollections.amount,
            settlementId: penaltyCollections.settlementId,
          })
          .from(penaltyCollections)
          .where(eq(penaltyCollections.penaltyId, penaltyId)),
      ).toEqual([{ amount: 5_000, settlementId: settlement.id }]);

      // 같은 날 다시 돌려도 새로 묶지 않는다
      const again = await runSettlementBatch(db, {
        now: kst('2026-11-05', '03:00'),
        paymentFeeRate: PAYMENT_FEE_RATE,
      });
      expect(again).toMatchObject({ status: 'done', failed: 0 });
      expect(await settlementsOf(tx, shop.shopId)).toHaveLength(1);
      expect(
        await tx
          .select()
          .from(settlementItems)
          .where(and(eq(settlementItems.shopId, shop.shopId))),
      ).toHaveLength(3);
    });
  });

  it('패널티를 떼고 0원이면 지급 요청 없이 지급 완료(0원)와 이유를 남기고, 못 뗀 패널티는 남긴다', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const shop = await createTestShop(tx, { status: 'approved' });
      await customerCancel(tx, shop, '09:00', '10:00');
      const ids = [];
      for (const [index, start] of ['10:00', '11:00', '12:00'].entries()) {
        const end = ['11:00', '12:00', '13:00'][index];
        ids.push(
          await ownerFaultPenalty(tx, shop, start, end, kst('2026-10-2' + (index + 1), '10:00')),
        );
      }

      await runSettlementBatch(db, {
        now: PAYOUT_NOW,
        paymentFeeRate: PAYMENT_FEE_RATE,
        mode: 'launch',
      });
      const [settlement] = await settlementsOf(tx, shop.shopId);
      expect(settlement).toMatchObject({
        itemCount: 1,
        penaltyDeducted: 13_055,
        payoutAmount: 0,
        status: 'paid',
        paidAt: PAYOUT_NOW,
        payoutRef: null,
        memo: '패널티로 상계해서 0원',
      });
      const penalties = await tx
        .select({
          id: ownerPenalties.id,
          collected: ownerPenalties.collectedAmount,
          full: ownerPenalties.fullyCollectedAt,
        })
        .from(ownerPenalties)
        .where(inArray(ownerPenalties.id, ids));
      expect(new Map(penalties.map((row) => [row.id, [row.collected, row.full]]))).toEqual(
        new Map([
          [ids[0], [5_000, PAYOUT_NOW]],
          [ids[1], [5_000, PAYOUT_NOW]],
          [ids[2], [3_055, null]],
        ]),
      );
    });
  });

  it('지급일이 아니면 묶지 않고, 결제 수수료율이 정해지기 전(PG 계약 전)에도 묶지 않는다', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const shop = await createTestShop(tx, { status: 'approved' });
      await finished(tx, shop, '09:00', '10:00', 'completed', visited(kst('2026-11-01', '11:00')));

      expect(
        await runSettlementBatch(db, {
          now: kst('2026-11-04', '00:30'),
          paymentFeeRate: PAYMENT_FEE_RATE,
        }),
      ).toEqual({ status: 'not_payout_day' });
      expect(await runSettlementBatch(db, { now: PAYOUT_NOW, paymentFeeRate: null })).toEqual({
        status: 'payment_fee_rate_missing',
        payoutDate: '2026-11-05',
      });
      expect(await settlementsOf(tx, shop.shopId)).toEqual([]);
    });
  });

  it('지급일 새벽 작업이 실패했으면 다음 날 새벽에 그 지급일 기준(그날 0시)으로 아직 묶지 않은 샵을 묶고, 이틀 뒤에는 따라잡지 않는다', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const shopA = await createTestShop(tx, { status: 'approved' });
      const shopB = await createTestShop(tx, { status: 'approved' });
      // 11/05(목) 새벽에 묶였어야 할 거래(11/01 처리, 기한 11/04 0시)
      await finished(tx, shopA, '09:00', '10:00', 'completed', visited(kst('2026-11-01', '11:00')));
      await finished(tx, shopB, '10:00', '11:00', 'completed', visited(kst('2026-11-01', '12:00')));
      // 11/04(수) 10시 처리는 기한이 11/06이라 11/05 기준으로는 묶이지 않는다(기준 시각은 그대로 11/05 0시)
      const late = await finished(
        tx,
        shopA,
        '11:00',
        '12:00',
        'completed',
        visited(kst('2026-11-04', '10:00')),
      );

      // 11/05(목) 작업은 돌지 못했고, 11/06(금) 새벽에 따라잡는다
      const friday = kst('2026-11-06', '00:30');
      const caught = await runSettlementBatch(db, {
        now: friday,
        paymentFeeRate: PAYMENT_FEE_RATE,
      });
      expect(caught).toMatchObject({
        status: 'done',
        payoutDate: '2026-11-05',
        catchUp: true,
        shops: 2,
        items: 2,
        failed: 0,
      });
      const [a] = await settlementsOf(tx, shopA.shopId);
      expect(a).toMatchObject({ periodEnd: '2026-11-05', itemCount: 1 });
      const lateItem = await tx
        .select()
        .from(settlementItems)
        .where(eq(settlementItems.orderId, late.order.id));
      expect(lateItem).toEqual([]);

      // 같은 날 다시 돌아도 두 번 묶지 않는다(이미 묶인 거래는 정산 줄이 있어서 후보에 없다)
      expect(
        await runSettlementBatch(db, { now: friday, paymentFeeRate: PAYMENT_FEE_RATE }),
      ).toMatchObject({ status: 'done', catchUp: true, shops: 0, items: 0, failed: 0 });
      expect(await settlementsOf(tx, shopA.shopId)).toHaveLength(1);
      expect(await settlementsOf(tx, shopB.shopId)).toHaveLength(1);
      // 이틀 뒤(11/07 토)는 따라잡지 않는다(SETTLEMENT_CATCH_UP_DAYS = 1)
      expect(
        await runSettlementBatch(db, {
          now: kst('2026-11-07', '00:30'),
          paymentFeeRate: PAYMENT_FEE_RATE,
        }),
      ).toEqual({ status: 'not_payout_day' });
    });
  });

  it('묶기 후보는 정산할 수 있는 거래만 읽고(원장님 사정·운영자·자동 취소 제외), 지급일 0시 뒤에 결론이 난 이의제기 거래는 그날 묶지 않는다', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const shop = await createTestShop(tx, { status: 'approved' });
      const adminId = await createTestUser(tx);
      const ok = await finished(
        tx,
        shop,
        '09:00',
        '10:00',
        'completed',
        visited(kst('2026-11-01', '11:00')),
      );
      const cancelled = await customerCancel(tx, shop, '10:00', '11:00');
      const ownerFault = await finished(tx, shop, '11:00', '12:00', 'cancelled', {
        cancelActor: 'owner_fault',
        cancelledAt: kst('2026-10-30', '10:00'),
      });
      const autoCancel = await finished(tx, shop, '12:00', '13:00', 'cancelled', {
        cancelActor: 'system',
        cancelledAt: kst('2026-10-30', '10:00'),
      });
      const adminRefunded = await finished(
        tx,
        shop,
        '13:00',
        '14:00',
        'completed',
        visited(kst('2026-11-01', '15:00')),
      );
      await tx.insert(refunds).values({
        orderId: adminRefunded.order.id,
        reservationId: adminRefunded.reservation.id,
        reason: 'admin_exception',
        status: 'done',
        penaltyRate: 0,
        refundAmount: 45_000,
        penaltyAmount: 0,
        processedAt: kst('2026-11-02', '10:00'),
      });
      // 이의제기: 지급일 0시 전에 결론(그날 묶는다) / 0시 뒤에 결론(그날은 아직 확인 중이었다)
      const resolvedBefore = await finished(
        tx,
        shop,
        '14:00',
        '15:00',
        'completed',
        visited(kst('2026-11-01', '16:00')),
      );
      const resolvedAfter = await finished(
        tx,
        shop,
        '15:00',
        '16:00',
        'completed',
        visited(kst('2026-11-01', '17:00')),
      );
      const dispute = (reservationId: string, handledAt: Date) => ({
        reservationId,
        type: 'after_start',
        content: '테스트 이의제기',
        status: 'resolved',
        channel: 'app',
        receivedAt: kst('2026-11-02', '10:00'),
        outcome: 'no_change',
        handledBy: adminId,
        handledAt,
      });
      await tx
        .insert(disputes)
        .values([
          dispute(resolvedBefore.reservation.id, kst('2026-11-04', '18:00')),
          dispute(resolvedAfter.reservation.id, kst('2026-11-05', '00:10')),
        ]);

      const cutoff = kst('2026-11-05', '00:00');
      const candidates = (await readBatchCandidates(tx, { cutoff })).filter(
        (candidate) => candidate.shopId === shop.shopId,
      );
      expect(candidates.map((candidate) => candidate.orderId).sort()).toEqual(
        [ok.order.id, cancelled.order.id, resolvedBefore.order.id].sort(),
      );
      expect(candidates.map((candidate) => candidate.orderId)).not.toContain(ownerFault.order.id);
      expect(candidates.map((candidate) => candidate.orderId)).not.toContain(autoCancel.order.id);

      const result = await runSettlementBatch(db, {
        now: PAYOUT_NOW,
        paymentFeeRate: PAYMENT_FEE_RATE,
      });
      expect(result).toMatchObject({ status: 'done', catchUp: false, shops: 1, items: 3 });
      // 0시 뒤에 결론이 난 거래는 다음 지급일에 묶인다
      const after = await tx
        .select()
        .from(settlementItems)
        .where(eq(settlementItems.orderId, resolvedAfter.order.id));
      expect(after).toEqual([]);
    });
  });
});
