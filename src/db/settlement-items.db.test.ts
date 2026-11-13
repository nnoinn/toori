// 정산 줄 규칙(마이그레이션 0014, #353)을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// - 거래(주문) 하나에 정산 줄 하나: 목요일 묶기가 두 번 돌거나 겹쳐 돌아도 같은 거래를 두 번 정산하지 않는다
// - 실제 PG 수수료는 PG 정산 자료가 와야 아는 값이라 묶을 때 비워 두고 나중에 채운다

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { settlementItems } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  type TestShop,
} from '../../tests/db/fixtures';
import {
  closeTestDb,
  describeDb,
  type TestTx,
  violatedConstraint,
  withRollback,
} from '../../tests/db/test-db';

/** 샵에 이용 완료 예약 하나('HH:MM', fixtures와 같은 날)를 만들고 주문을 돌려준다 */
async function completedOrder(tx: TestTx, shop: TestShop, start: string, end: string) {
  const { customerId } = await createTestCustomer(tx);
  const { order } = await createTestReservation(tx, shop, customerId, start, end, 'completed');
  return order;
}

/** 이용 완료 정산 줄(오픈 기간: 플랫폼 수수료 0%). 실제 PG 수수료는 넣지 않는다 */
function saleItem(shop: TestShop, order: { id: string; salePrice: number }) {
  return {
    shopId: shop.shopId,
    orderId: order.id,
    kind: 'sale',
    baseAmount: order.salePrice,
    feeRate: 0,
    feeAmount: 0,
    feeVat: 0,
    paymentFeeRate: 3,
    paymentFee: 0,
    paymentFeeVat: 0,
    payoutAmount: order.salePrice,
  } satisfies typeof settlementItems.$inferInsert;
}

describeDb('정산 줄 규칙 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('같은 거래로 정산 줄을 두 번 만들 수 없다(settlement_items_order_id_unique)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const order = await completedOrder(tx, shop, '09:00', '10:00');
      const other = await completedOrder(tx, shop, '11:00', '12:00');
      await tx.insert(settlementItems).values(saleItem(shop, order));

      expect(
        await violatedConstraint(tx, (t) =>
          t.insert(settlementItems).values({ ...saleItem(shop, order), kind: 'no_show' }),
        ),
      ).toBe('settlement_items_order_id_unique');
      expect(
        await violatedConstraint(tx, (t) =>
          t.insert(settlementItems).values(saleItem(shop, other)),
        ),
      ).toBeUndefined();
    });
  });

  it('실제 PG 수수료는 묶을 때 비워 두고, PG 정산 자료가 오면 채운다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const order = await completedOrder(tx, shop, '09:00', '10:00');
      const [saved] = await tx.insert(settlementItems).values(saleItem(shop, order)).returning();
      expect(saved.pgFeeActual).toBeNull();

      await tx
        .update(settlementItems)
        .set({ pgFeeActual: 1_234 })
        .where(eq(settlementItems.id, saved.id));
      const [row] = await tx.select().from(settlementItems).where(eq(settlementItems.id, saved.id));
      expect(row.pgFeeActual).toBe(1_234);
    });
  });
});
