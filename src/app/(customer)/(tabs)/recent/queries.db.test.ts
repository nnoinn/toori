// 최근 본 매물(C-212)을 지금 값으로 다시 읽을 때 매물 상세와 같은 조건으로 거르는지 실제 DB로 본다.
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { afterAll, expect, it } from 'vitest';

import { slots } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  testSlot,
  type TestShop,
} from '../../../../../tests/db/fixtures';
import {
  closeTestDb,
  describeDb,
  type TestTx,
  withRollback,
} from '../../../../../tests/db/test-db';
import { selectRecentSlots } from './queries';

afterAll(closeTestDb);

/** 매물(11/1)은 모두 게시 시각(10/30) 뒤, 시작 전 */
const NOW = new Date('2026-10-31T09:00:00+09:00');

async function insertSlot(
  tx: TestTx,
  shop: TestShop,
  start: string,
  end: string,
  extra: Partial<typeof slots.$inferInsert> = {},
) {
  const [row] = await tx
    .insert(slots)
    .values(testSlot(shop, start, end, extra))
    .returning();
  return row;
}

describeDb('최근 본 매물 다시 읽기 (C-212)', () => {
  it('게시중은 그대로, 예약됨·마감은 흐리게(closed), 시작이 지났거나 게시 전·승인 안 된 샵은 뺀다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const pending = await createTestShop(tx, { status: 'pending' });
      const open = await insertSlot(tx, shop, '10:00', '11:00');
      const closed = await insertSlot(tx, shop, '12:00', '13:00', { status: 'closed' });
      const scheduled = await insertSlot(tx, shop, '14:00', '15:00', {
        status: 'scheduled',
        publishAt: new Date('2026-11-01T00:00:00+09:00'),
      });
      const unapproved = await insertSlot(tx, pending, '10:00', '11:00');

      const items = await selectRecentSlots(tx, {
        slotIds: [open.id, closed.id, scheduled.id, unapproved.id],
        customerId: null,
        now: NOW,
      });
      const byId = new Map(items.map((item) => [item.id, item]));
      expect([...byId.keys()].sort()).toEqual([open.id, closed.id].sort());
      expect(byId.get(open.id)).toMatchObject({
        kind: 'slot',
        shopName: '테스트 미용실',
        menuName: '커트',
        discountRate: 30,
        salePrice: 14000,
        closed: false,
      });
      expect(byId.get(closed.id)?.closed).toBe(true);

      // 시작이 지나면(다음 날) 모두 빠진다
      const later = await selectRecentSlots(tx, {
        slotIds: [open.id, closed.id],
        customerId: null,
        now: new Date('2026-11-02T09:00:00+09:00'),
      });
      expect(later).toEqual([]);
    });
  });

  it('신규 고객 전용은 그 샵 이력이 있는 고객에게 빠진다(매물 상세와 같다)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const visited = await createTestCustomer(tx);
      await createTestReservation(tx, shop, visited.customerId, '08:00', '09:00', 'completed');
      const onlyNew = await insertSlot(tx, shop, '10:00', '11:00', { newCustomerOnly: true });

      const query = { slotIds: [onlyNew.id], now: NOW };
      expect(await selectRecentSlots(tx, { ...query, customerId: visited.customerId })).toEqual([]);
      expect(await selectRecentSlots(tx, { ...query, customerId: null })).toHaveLength(1);
    });
  });
});
