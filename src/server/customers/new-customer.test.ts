// 신규 고객 판별 (#49). 이력 기준(확정·이용 완료(노쇼 포함)만, 취소 제외)과 목록 조건을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.

import { and, inArray } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { orders, reservations, slots } from '@/db/schema';
import type { ReservationStatus } from '@/db/schema/payments';

import {
  createTestCustomer,
  createTestShop,
  testSlot,
  type TestShop,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import { getVisitedShopIds, isNewCustomer, newCustomerOnlyVisible } from './new-customer';

let seq = 0;

/** 같은 샵 매물끼리 시간이 겹치지 않게(slots_no_overlap) 매번 다른 20분 칸의 'HH:MM' 시작·끝을 준다 */
function nextWindow(): [string, string] {
  seq += 1;
  const i = seq % 72;
  const hm = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  return [hm(i * 20), hm(i * 20 + 15)];
}

/** 매물 → 주문 → 예약 한 벌(이력 판별에 쓰는 예약) */
async function createReservation(
  tx: TestTx,
  shop: TestShop,
  customerId: string,
  status: ReservationStatus,
  visitResult: 'visited' | 'no_show' | null = null,
) {
  const [start, end] = nextWindow();
  const slotStatus = { confirmed: 'reserved', completed: 'completed', cancelled: 'cancelled' }[
    status
  ];
  const [slot] = await tx
    .insert(slots)
    .values(testSlot(shop, start, end, { status: slotStatus }))
    .returning();
  const [order] = await tx
    .insert(orders)
    .values({
      paymentId: `test_${seq}_${crypto.randomUUID()}`,
      slotId: slot.id,
      customerId,
      salePrice: 14000,
      amount: 14000,
      refundPolicyVersion: 'test',
      refundPolicyAgreedAt: new Date('2026-10-30T10:00:00+09:00'),
      status: 'confirmed',
      paidAt: new Date('2026-10-30T10:05:00+09:00'),
    })
    .returning();
  await tx.insert(reservations).values({
    code: `N${String(seq).padStart(7, '0')}`,
    slotId: slot.id,
    orderId: order.id,
    customerId,
    status,
    visitResult,
  });
}

/** 게시중인 매물 하나(일반 또는 신규 고객 전용) */
async function createListedSlot(tx: TestTx, shop: TestShop, newCustomerOnly: boolean) {
  const [start, end] = nextWindow();
  const [slot] = await tx
    .insert(slots)
    .values(testSlot(shop, start, end, { newCustomerOnly }))
    .returning({ id: slots.id });
  return slot.id;
}

/** 목록 조건을 넣었을 때 보이는 매물 id */
async function visibleSlotIds(tx: TestTx, customerId: string | null, slotIds: string[]) {
  const rows = await tx
    .select({ id: slots.id })
    .from(slots)
    .where(and(newCustomerOnlyVisible(customerId), inArray(slots.id, slotIds)));
  return new Set(rows.map((row) => row.id));
}

describeDb('신규 고객 판별 (실제 DB)', () => {
  afterAll(closeTestDb);

  it.each([
    { history: '이력 없음', status: null, visitResult: null, isNew: true },
    { history: '확정', status: 'confirmed', visitResult: null, isNew: false },
    { history: '이용 완료', status: 'completed', visitResult: 'visited', isNew: false },
    { history: '노쇼', status: 'completed', visitResult: 'no_show', isNew: false },
    { history: '취소만 있음', status: 'cancelled', visitResult: null, isNew: true },
  ] as const)('$history → 신규 고객 $isNew', async ({ status, visitResult, isNew }) => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      if (status) await createReservation(tx, shop, customerId, status, visitResult);

      expect(await isNewCustomer(customerId, shop.shopId, tx)).toBe(isNew);

      // 목록: 일반 매물은 늘 보이고, 신규 고객 전용은 신규일 때만 보인다
      const normal = await createListedSlot(tx, shop, false);
      const newOnly = await createListedSlot(tx, shop, true);
      const visible = await visibleSlotIds(tx, customerId, [normal, newOnly]);
      expect(visible.has(normal)).toBe(true);
      expect(visible.has(newOnly)).toBe(isNew);
    });
  });

  it('다른 샵 이력이나 다른 고객의 이력은 상관없다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const otherShop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const other = await createTestCustomer(tx);
      await createReservation(tx, otherShop, customerId, 'completed', 'visited');
      await createReservation(tx, shop, other.customerId, 'completed', 'visited');

      expect(await isNewCustomer(customerId, shop.shopId, tx)).toBe(true);
      const newOnly = await createListedSlot(tx, shop, true);
      expect(await visibleSlotIds(tx, customerId, [newOnly])).toEqual(new Set([newOnly]));
    });
  });

  it('로그인 안 함(null)이면 이력과 상관없이 신규 고객 전용 매물도 모두 보인다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      await createReservation(tx, shop, customerId, 'completed', 'visited');
      const newOnly = await createListedSlot(tx, shop, true);

      expect(await visibleSlotIds(tx, null, [newOnly])).toEqual(new Set([newOnly]));
      expect(await visibleSlotIds(tx, customerId, [newOnly])).toEqual(new Set());
    });
  });

  it('getVisitedShopIds는 여러 샵 중 이력이 있는 샵만 한 번에 돌려준다', async () => {
    await withRollback(async (tx) => {
      const visited = await createTestShop(tx, { status: 'approved' });
      const cancelledOnly = await createTestShop(tx, { status: 'approved' });
      const untouched = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      await createReservation(tx, visited, customerId, 'completed', 'visited');
      await createReservation(tx, visited, customerId, 'confirmed');
      await createReservation(tx, cancelledOnly, customerId, 'cancelled');

      const shopIds = [visited.shopId, cancelledOnly.shopId, untouched.shopId, visited.shopId];
      expect(await getVisitedShopIds(customerId, shopIds, tx)).toEqual(new Set([visited.shopId]));
      expect(await getVisitedShopIds(customerId, [], tx)).toEqual(new Set());
    });
  });
});
