// 관심 매물(C-211) 저장·조회를 실제 DB로 본다. TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사).
// 표 slot_interests는 #623(마이그레이션 0024)이 만든다

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { slotInterests, slots, slotWindows } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  testSlot,
  type TestShop,
} from '../../../../../../tests/db/fixtures';
import {
  closeTestDb,
  describeDb,
  type TestTx,
  withRollback,
} from '../../../../../../tests/db/test-db';
import {
  addSlotInterest,
  isSlotInterested,
  removeSlotInterest,
  selectInterestedSlots,
} from './slot-interest-store';

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

describeDb('관심 매물 (C-211)', () => {
  it('켜고 끄기: 내 관심만 바뀌고, 여러 번 눌러도 하나다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const other = await createTestCustomer(tx);
      const slot = await insertSlot(tx, shop, '10:00', '11:00');

      expect(await addSlotInterest(tx, me.customerId, slot.id)).toBe(true);
      expect(await addSlotInterest(tx, me.customerId, slot.id)).toBe(true);
      expect(await isSlotInterested(tx, me.customerId, slot.id)).toBe(true);
      expect(await isSlotInterested(tx, other.customerId, slot.id)).toBe(false);
      expect(await tx.select().from(slotInterests)).toHaveLength(1);

      await removeSlotInterest(tx, other.customerId, slot.id);
      expect(await isSlotInterested(tx, me.customerId, slot.id)).toBe(true);
      await removeSlotInterest(tx, me.customerId, slot.id);
      expect(await isSlotInterested(tx, me.customerId, slot.id)).toBe(false);
    });
  });

  it('관심 표시할 수 없는 매물: 승인 안 된 샵, 게시 전, 시간대 안에서 손님이 만든 매물, 없는 매물', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const pending = await createTestShop(tx, { status: 'pending' });
      const me = await createTestCustomer(tx);
      const unapproved = await insertSlot(tx, pending, '10:00', '11:00');
      const scheduled = await insertSlot(tx, shop, '12:00', '13:00', {
        status: 'scheduled',
        publishAt: new Date('2099-01-01T00:00:00+09:00'),
      });
      const [window] = await tx
        .insert(slotWindows)
        .values({
          shopId: shop.shopId,
          startAt: new Date('2026-11-01T14:00:00+09:00'),
          endAt: new Date('2026-11-01T18:00:00+09:00'),
          publishAt: new Date('2026-10-30T14:00:00+09:00'),
          status: 'published',
          createdBy: shop.createdBy,
        })
        .returning();
      const inWindow = await insertSlot(tx, shop, '15:00', '16:00', { windowId: window.id });

      for (const slotId of [
        unapproved.id,
        scheduled.id,
        inWindow.id,
        '00000000-0000-4000-8000-000000000000',
      ]) {
        expect(await addSlotInterest(tx, me.customerId, slotId)).toBe(false);
      }
      expect(await tx.select().from(slotInterests)).toEqual([]);
    });
  });

  it('목록: 최근 표시한 순, 마감된 매물은 아래 칸, 볼 수 없게 된 매물은 뺀다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const first = await insertSlot(tx, shop, '10:00', '11:00');
      const second = await insertSlot(tx, shop, '12:00', '13:00', {
        discountRate: 50,
        salePrice: 10000,
      });
      const closed = await insertSlot(tx, shop, '14:00', '15:00');
      const onlyNew = await insertSlot(tx, shop, '16:00', '17:00', { newCustomerOnly: true });
      for (const slot of [first, second, closed, onlyNew]) {
        expect(await addSlotInterest(tx, me.customerId, slot.id)).toBe(true);
      }
      // 표시한 뒤 원장님이 마감하고, 이 고객이 그 샵을 이용해서 신규 고객 전용이 보이지 않게 됐다
      await tx.update(slots).set({ status: 'closed' }).where(eq(slots.id, closed.id));
      await createTestReservation(tx, shop, me.customerId, '08:00', '09:00', 'completed');
      // 표시한 순서를 분명히 한다
      for (const [i, slot] of [first, second, closed, onlyNew].entries()) {
        await tx
          .update(slotInterests)
          .set({ createdAt: new Date(`2026-10-30T1${i}:00:00+09:00`) })
          .where(eq(slotInterests.slotId, slot.id));
      }

      const result = await selectInterestedSlots(tx, { customerId: me.customerId, now: NOW });
      expect(result.open.map((item) => item.slotId)).toEqual([second.id, first.id]);
      expect(result.open[0]).toMatchObject({ kind: 'slot', discountRate: 50, salePrice: 10000 });
      expect(result.closed.map((item) => item.slotId)).toEqual([closed.id]);

      // 시작이 지나면 마감된 매물 칸으로
      const later = await selectInterestedSlots(tx, {
        customerId: me.customerId,
        now: new Date('2026-11-01T11:30:00+09:00'),
      });
      expect(later.open.map((item) => item.slotId)).toEqual([second.id]);
      expect(later.closed.map((item) => item.slotId)).toEqual([closed.id, first.id]);
    });
  });
});
