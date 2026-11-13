// 원장님 정산서 DB 읽기(statement-store.ts)와 정산 묶음별 예약 읽기(readShopSettlementRows의 settlementId)를
// 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다. 정산서 계산은 statement-view.test.ts가 본다.

import { afterAll, expect, it } from 'vitest';

import {
  ownerPenalties,
  payoutAccounts,
  penaltyCollections,
  settlementItems,
  settlements,
  type SettlementItemKind,
} from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  type TestShop,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import { readShopSettlementRows } from './settlement-store';
import {
  readLastPayoutDate,
  readPayoutAccount,
  readPenaltyCollections,
  readShopSettlements,
} from './statement-store';

const at = (value: string) => new Date(`${value}+09:00`);

type Made = Awaited<ReturnType<typeof createTestReservation>>;

/** 11/1 hh:00 서비스를 그 한 시간 뒤 방문 완료로 처리한 예약 */
function completed(tx: TestTx, shop: TestShop, customerId: string, hour: number) {
  const hh = String(hour).padStart(2, '0');
  const end = String(hour + 1).padStart(2, '0');
  return createTestReservation(tx, shop, customerId, `${hh}:00`, `${end}:00`, 'completed', {
    visitResult: 'visited',
    visitRecordedAt: at(`2026-11-01T${end}:00:00`),
  });
}

/** 정산 묶음 하나(지급일 periodEnd) */
async function settlement(
  tx: TestTx,
  shop: TestShop,
  periodEnd: string,
  extra: Partial<typeof settlements.$inferInsert> = {},
) {
  const [row] = await tx
    .insert(settlements)
    .values({
      shopId: shop.shopId,
      periodStart: '2026-10-30',
      periodEnd,
      itemCount: 0,
      totalBaseAmount: 0,
      totalFeeAmount: 0,
      penaltyDeducted: 0,
      payoutAmount: 0,
      status: 'pending',
      ...extra,
    })
    .returning();
  return row;
}

/** 그 묶음에 정산 줄 하나 */
function item(
  tx: TestTx,
  shop: TestShop,
  made: Made,
  settlementId: string,
  kind: SettlementItemKind,
  fees: { feeAmount: number; feeVat: number; paymentFee: number; paymentFeeVat: number },
) {
  return tx.insert(settlementItems).values({
    shopId: shop.shopId,
    orderId: made.order.id,
    kind,
    baseAmount: 14_000,
    feeRate: 0,
    paymentFeeRate: 3.0,
    payoutAmount: 13_000,
    settlementId,
    ...fees,
  });
}

describeDb('원장님 정산서 읽기 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('readShopSettlements: 내 샵 묶음을 지급일이 늦은 것부터 읽고, 종류별 건수와 수수료 합계를 더하며, 지급일로 거른다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const other = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const older = await settlement(tx, shop, '2026-11-05', {
        status: 'paid',
        totalBaseAmount: 28_000,
        penaltyDeducted: 5_000,
        payoutAmount: 21_000,
        paidAt: at('2026-11-05T11:00:00'),
      });
      const newer = await settlement(tx, shop, '2026-11-12');
      await settlement(tx, other, '2026-11-12');
      const fees = { feeAmount: 100, feeVat: 10, paymentFee: 420, paymentFeeVat: 42 };
      await item(tx, shop, await completed(tx, shop, customerId, 9), older.id, 'sale', fees);
      await item(tx, shop, await completed(tx, shop, customerId, 10), older.id, 'no_show', fees);
      await item(tx, shop, await completed(tx, shop, customerId, 11), newer.id, 'penalty', fees);

      const all = await readShopSettlements(tx, { shopId: shop.shopId });
      expect(all.map((row) => row.periodEnd)).toEqual(['2026-11-12', '2026-11-05']);
      expect(all[1]).toEqual({
        id: older.id,
        periodStart: '2026-10-30',
        periodEnd: '2026-11-05',
        status: 'paid',
        totalBaseAmount: 28_000,
        penaltyDeducted: 5_000,
        payoutAmount: 21_000,
        paidAt: at('2026-11-05T11:00:00'),
        counts: { sale: 1, no_show: 1, penalty: 0, agreed_cancel: 0 },
        // (100 + 10) × 2, (420 + 42) × 2
        platformFeeTotal: 220,
        paymentFeeTotal: 924,
      });
      expect(all[0].counts).toEqual({ sale: 0, no_show: 0, penalty: 1, agreed_cancel: 0 });

      const ranged = await readShopSettlements(tx, {
        shopId: shop.shopId,
        from: '2026-11-06',
        to: '2026-11-12',
      });
      expect(ranged.map((row) => row.id)).toEqual([newer.id]);
      const one = await readShopSettlements(tx, { shopId: shop.shopId, payoutDate: '2026-11-05' });
      expect(one.map((row) => row.id)).toEqual([older.id]);

      // 줄이 없는 묶음도 건수 0으로 읽는다
      const empty = await createTestShop(tx, { status: 'approved' });
      await settlement(tx, empty, '2026-11-12');
      const [bare] = await readShopSettlements(tx, { shopId: empty.shopId });
      expect(bare).toMatchObject({
        counts: { sale: 0, no_show: 0, penalty: 0, agreed_cancel: 0 },
        platformFeeTotal: 0,
        paymentFeeTotal: 0,
      });
    });
  });

  it('readShopSettlementRows settlementId: 그 묶음에 묶인 예약만 읽는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const first = await settlement(tx, shop, '2026-11-05');
      const second = await settlement(tx, shop, '2026-11-12');
      const fees = { feeAmount: 0, feeVat: 0, paymentFee: 420, paymentFeeVat: 42 };
      const inFirst = await completed(tx, shop, customerId, 9);
      const inSecond = await completed(tx, shop, customerId, 10);
      await completed(tx, shop, customerId, 11);
      await item(tx, shop, inFirst, first.id, 'sale', fees);
      await item(tx, shop, inSecond, second.id, 'sale', fees);

      const rows = await readShopSettlementRows(tx, {
        shopId: shop.shopId,
        settlementId: first.id,
      });
      expect(rows.map((row) => row.reservationId)).toEqual([inFirst.reservation.id]);
    });
  });

  it('readPenaltyCollections: 묶음마다 뗀 패널티의 예약번호·금액을 오래된 패널티부터 읽는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const target = await settlement(tx, shop, '2026-11-12');
      const elsewhere = await settlement(tx, shop, '2026-11-05');
      const cancel = (hour: number) =>
        createTestReservation(
          tx,
          shop,
          customerId,
          `${String(hour).padStart(2, '0')}:00`,
          `${String(hour + 1).padStart(2, '0')}:00`,
          'cancelled',
          { cancelActor: 'owner_fault', cancelledAt: at('2026-10-31T09:00:00') },
        );
      const firstCancel = await cancel(9);
      const secondCancel = await cancel(10);
      const [laterPenalty, earlierPenalty] = await tx
        .insert(ownerPenalties)
        .values([
          {
            shopId: shop.shopId,
            reservationId: secondCancel.reservation.id,
            amount: 5_000,
            createdAt: at('2026-10-31T10:00:00'),
          },
          {
            shopId: shop.shopId,
            reservationId: firstCancel.reservation.id,
            amount: 5_000,
            createdAt: at('2026-10-30T10:00:00'),
          },
        ])
        .returning();
      await tx.insert(penaltyCollections).values([
        { penaltyId: laterPenalty.id, settlementId: target.id, amount: 3_000 },
        { penaltyId: earlierPenalty.id, settlementId: target.id, amount: 5_000 },
        { penaltyId: laterPenalty.id, settlementId: elsewhere.id, amount: 2_000 },
      ]);

      expect(await readPenaltyCollections(tx, [target.id])).toEqual([
        // 10/30에 생긴 패널티가 먼저
        { settlementId: target.id, reservationCode: firstCancel.reservation.code, amount: 5_000 },
        { settlementId: target.id, reservationCode: secondCancel.reservation.code, amount: 3_000 },
      ]);
      expect(await readPenaltyCollections(tx, [])).toEqual([]);
    });
  });

  it('readLastPayoutDate와 readPayoutAccount: 가장 최근 지급일, 은행 이름과 끝 4자리만', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      expect(await readLastPayoutDate(tx, shop.shopId)).toBeNull();
      expect(await readPayoutAccount(tx, shop.shopId)).toBeNull();

      await settlement(tx, shop, '2026-11-05');
      await settlement(tx, shop, '2026-11-12', { status: 'failed' });
      await tx.insert(payoutAccounts).values({
        shopId: shop.shopId,
        bankCode: '004',
        accountNumberEncrypted: 'test-encrypted',
        accountLast4: '1234',
        accountHolder: '테스트 예금주',
      });
      expect(await readLastPayoutDate(tx, shop.shopId)).toBe('2026-11-12');
      expect(await readPayoutAccount(tx, shop.shopId)).toEqual({
        bankName: 'KB국민은행',
        accountLast4: '1234',
      });
    });
  });
});
