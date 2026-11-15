// 운영자 정산 관리 조회(A-105)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 정산서 한 장의 합계·거래·뗀 패널티는 원장님 정산서와 같은 함수라 server/settlements/statement-store.db.test.ts가 본다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { disputes, ownerPenalties, settlementItems, settlements, shops } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  type TestShop,
} from '../../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../../tests/db/test-db';
import {
  countOpenDisputes,
  selectOutstandingPenalties,
  selectSettlementItemExtras,
  selectSettlementOwner,
  selectSettlements,
  selectShopName,
} from './queries';

const unique = (prefix: string) => `${prefix}${crypto.randomUUID().slice(0, 8)}`;
const at = (value: string) => new Date(`${value}+09:00`);

/** 이름이 겹치지 않는 승인된 샵 */
async function namedShop(tx: TestTx, prefix: string) {
  const shop = await createTestShop(tx, { status: 'approved' });
  const name = unique(prefix);
  await tx.update(shops).set({ name }).where(eq(shops.id, shop.shopId));
  return { ...shop, name };
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
      itemCount: 1,
      totalBaseAmount: 14_000,
      totalFeeAmount: 462,
      penaltyDeducted: 0,
      payoutAmount: 13_538,
      status: 'pending',
      ...extra,
    })
    .returning();
  return row;
}

describeDb('운영자 정산 관리 조회 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('정산 목록: 탭(상태)·샵 이름·지급일 기간으로 거르고, 정렬을 고른 대로 놓는다', async () => {
    await withRollback(async (tx) => {
      const prefix = unique('정산샵');
      const a = await namedShop(tx, `${prefix}A`);
      const b = await namedShop(tx, `${prefix}B`);
      const early = await settlement(tx, a, '2026-11-05', { payoutAmount: 5_000 });
      const late = await settlement(tx, b, '2026-11-12', { payoutAmount: 30_000 });
      const paid = await settlement(tx, a, '2026-11-12', {
        status: 'paid',
        paidAt: at('2026-11-12T11:00:00'),
      });
      await settlement(tx, b, '2026-11-19', { status: 'failed' });

      const ids = async (
        filter: 'pending' | 'paid' | 'failed' | 'all',
        sort: 'payout_old' | 'payout_new' | 'amount_high',
        range: { from?: string; to?: string } = {},
      ) =>
        (
          await selectSettlements(tx, {
            filter,
            sort,
            query: prefix,
            from: range.from ?? null,
            to: range.to ?? null,
          })
        ).rows.map((row) => row.settlementId);

      expect(await ids('pending', 'payout_old')).toEqual([early.id, late.id]);
      expect(await ids('pending', 'payout_new')).toEqual([late.id, early.id]);
      expect(await ids('pending', 'amount_high')).toEqual([late.id, early.id]);
      expect(await ids('paid', 'payout_new')).toEqual([paid.id]);
      expect(await ids('all', 'payout_old')).toHaveLength(4);
      // 지급일 기간(둘 다 포함)
      expect(await ids('all', 'payout_old', { from: '2026-11-12', to: '2026-11-12' })).toHaveLength(
        2,
      );
      expect(await ids('pending', 'payout_old', { from: '2026-11-06' })).toEqual([late.id]);

      const [row] = (
        await selectSettlements(tx, {
          filter: 'paid',
          sort: 'payout_new',
          query: a.name,
          from: null,
          to: null,
        })
      ).rows;
      expect(row).toEqual({
        settlementId: paid.id,
        shopId: a.shopId,
        shopName: a.name,
        periodStart: '2026-10-30',
        payoutDate: '2026-11-12',
        itemCount: 1,
        baseAmount: 14_000,
        feeAmount: 462,
        penaltyDeducted: 0,
        payoutAmount: 13_538,
        status: 'paid',
        paidAt: at('2026-11-12T11:00:00'),
      });
    });
  });

  it('미수 패널티: 다 걷지 못한 패널티만 샵별로 건수·남은 금액을 더하고, 오래된 패널티가 있는 샵부터', async () => {
    await withRollback(async (tx) => {
      const older = await namedShop(tx, '미수샵');
      const newer = await namedShop(tx, '미수샵');
      const clean = await namedShop(tx, '미수샵');
      const { customerId } = await createTestCustomer(tx);
      const cancel = (shop: TestShop, hour: number) =>
        createTestReservation(
          tx,
          shop,
          customerId,
          `${String(hour).padStart(2, '0')}:00`,
          `${String(hour + 1).padStart(2, '0')}:00`,
          'cancelled',
          { cancelActor: 'owner_fault', cancelledAt: at('2026-10-31T09:00:00') },
        );
      const penalty = async (
        shop: TestShop,
        hour: number,
        values: Partial<typeof ownerPenalties.$inferInsert>,
      ) => {
        const made = await cancel(shop, hour);
        await tx.insert(ownerPenalties).values({
          shopId: shop.shopId,
          reservationId: made.reservation.id,
          amount: 5_000,
          ...values,
        });
      };
      await penalty(older, 9, { createdAt: at('2026-10-20T10:00:00'), collectedAmount: 2_000 });
      await penalty(older, 10, { createdAt: at('2026-10-25T10:00:00') });
      await penalty(newer, 9, { createdAt: at('2026-10-28T10:00:00') });
      // 다 걷은 패널티는 미수가 아니다
      await penalty(clean, 9, {
        createdAt: at('2026-10-01T10:00:00'),
        collectedAmount: 5_000,
        fullyCollectedAt: at('2026-10-08T10:00:00'),
      });

      const rows = (await selectOutstandingPenalties(tx)).filter((row) =>
        [older.shopId, newer.shopId, clean.shopId].includes(row.shopId),
      );
      expect(rows).toEqual([
        {
          shopId: older.shopId,
          shopName: older.name,
          count: 2,
          remaining: 8_000,
          oldestAt: at('2026-10-20T10:00:00'),
        },
        {
          shopId: newer.shopId,
          shopName: newer.name,
          count: 1,
          remaining: 5_000,
          oldestAt: at('2026-10-28T10:00:00'),
        },
      ]);
    });
  });

  it('확인 중 이의제기 수는 결론이 난 것을 세지 않는다', async () => {
    await withRollback(async (tx) => {
      const before = await countOpenDisputes(tx);
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const visited = (hour: number) =>
        createTestReservation(
          tx,
          shop,
          customerId,
          `${String(hour).padStart(2, '0')}:00`,
          `${String(hour + 1).padStart(2, '0')}:00`,
          'completed',
          { visitResult: 'visited', visitRecordedAt: at('2026-11-01T12:00:00') },
        );
      const open = await visited(9);
      const resolved = await visited(10);
      await tx.insert(disputes).values([
        {
          reservationId: open.reservation.id,
          type: 'after_start',
          content: '테스트 이의제기',
          status: 'open',
          channel: 'app',
          receivedAt: at('2026-11-02T10:00:00'),
        },
        {
          reservationId: resolved.reservation.id,
          type: 'after_start',
          content: '테스트 이의제기',
          status: 'resolved',
          channel: 'app',
          receivedAt: at('2026-11-02T10:00:00'),
          outcome: 'no_change',
        },
      ]);
      expect(await countOpenDisputes(tx)).toBe(before + 1);
    });
  });

  it('정산서 한 장의 샵·지급일과 거래마다 운영자 칸(쿠폰·실제 PG 수수료)을 읽고, 없는 정산이면 null', async () => {
    await withRollback(async (tx) => {
      const shop = await namedShop(tx, '상세샵');
      const { customerId } = await createTestCustomer(tx);
      const row = await settlement(tx, shop, '2026-11-12');
      const withCoupon = await createTestReservation(
        tx,
        shop,
        customerId,
        '09:00',
        '10:00',
        'completed',
        {
          visitResult: 'visited',
          visitRecordedAt: at('2026-11-01T10:00:00'),
        },
      );
      const withPgFee = await createTestReservation(
        tx,
        shop,
        customerId,
        '10:00',
        '11:00',
        'completed',
        {
          visitResult: 'visited',
          visitRecordedAt: at('2026-11-01T11:00:00'),
        },
      );
      const fees = {
        shopId: shop.shopId,
        kind: 'sale',
        baseAmount: 14_000,
        feeRate: 0,
        feeAmount: 0,
        feeVat: 0,
        paymentFeeRate: 3.0,
        paymentFee: 420,
        paymentFeeVat: 42,
        payoutAmount: 13_538,
        settlementId: row.id,
      };
      await tx.insert(settlementItems).values([
        { ...fees, orderId: withCoupon.order.id, couponAmount: 3_000 },
        { ...fees, orderId: withPgFee.order.id, pgFeeActual: 308 },
      ]);

      expect(await selectSettlementOwner(tx, row.id)).toEqual({
        shopId: shop.shopId,
        shopName: shop.name,
        payoutDate: '2026-11-12',
      });
      expect(await selectSettlementOwner(tx, crypto.randomUUID())).toBeNull();
      expect(await selectShopName(tx, shop.shopId)).toEqual({
        shopId: shop.shopId,
        shopName: shop.name,
      });
      expect(await selectShopName(tx, crypto.randomUUID())).toBeNull();

      const extras = await selectSettlementItemExtras(tx, row.id);
      expect(extras.get(withCoupon.reservation.id)).toEqual({
        couponAmount: 3_000,
        pgFeeActual: null,
      });
      expect(extras.get(withPgFee.reservation.id)).toEqual({ couponAmount: 0, pgFeeActual: 308 });
      expect(extras.size).toBe(2);
    });
  });
});
