// 영업시간을 바꿀 때 살펴볼 매물을 고르고, 고른 매물·시간대를 마감하는지 실제 DB로 본다(11/16 정민석).
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { eq, inArray } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { slots, slotWindowMenus, slotWindows } from '@/db/schema';

import {
  createTestCustomer,
  createTestShop,
  type TestShop,
  testSlot,
} from '../../../../../../tests/db/fixtures';
import {
  closeTestDb,
  describeDb,
  type TestTx,
  withRollback,
} from '../../../../../../tests/db/test-db';
import { closeForHoursChange, selectHoursChangeCandidates } from './hours-change-store';

afterAll(closeTestDb);

// 매물 날짜(2026-11-01, 일요일) 전날
const now = new Date('2026-10-31T12:00:00+09:00');
const kst = (hm: string) => new Date(`2026-11-01T${hm}:00+09:00`);

/** 시간대 한 줄과 서비스 하나(커트)를 넣는다 */
async function addWindow(
  tx: TestTx,
  shop: TestShop,
  start: string,
  end: string,
  extra: Partial<typeof slotWindows.$inferInsert> = {},
) {
  const [row] = await tx
    .insert(slotWindows)
    .values({
      shopId: shop.shopId,
      startAt: kst(start),
      endAt: kst(end),
      publishAt: new Date('2026-10-30T10:00:00+09:00'),
      status: 'published',
      createdBy: shop.createdBy,
      ...extra,
    })
    .returning({ id: slotWindows.id });
  await tx.insert(slotWindowMenus).values({
    windowId: row.id,
    menuId: shop.menuId,
    serviceType: 'cut',
    menuName: '커트',
    listPrice: 20000,
    durationMinutes: 60,
    discountRate: 30,
    salePrice: 14000,
  });
  return row.id;
}

describeDb('영업시간 변경 때 매물 (실제 DB)', () => {
  it('그 샵의 끝나지 않은 판매 전·예약됨 매물과 판매 중 시간대만 고른다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const other = await createTestShop(tx);
      await tx.insert(slots).values([
        testSlot(shop, '10:00', '11:00'),
        testSlot(shop, '11:00', '12:00', { status: 'reserved' }),
        // 고르지 않는다: 마감·취소·완료, 이미 끝난 매물, 다른 샵 매물
        testSlot(shop, '12:00', '13:00', { status: 'closed', closeReason: 'mistake' }),
        testSlot(shop, '13:00', '14:00', { status: 'cancelled' }),
        testSlot(shop, '14:00', '15:00', { status: 'completed' }),
        testSlot(shop, '15:00', '16:00', {
          startAt: new Date('2026-10-31T09:00:00+09:00'),
          endAt: new Date('2026-10-31T10:00:00+09:00'),
        }),
        testSlot(other, '10:00', '11:00'),
      ]);
      const open = await addWindow(tx, shop, '16:00', '19:00');
      await addWindow(tx, shop, '19:00', '20:00', { status: 'closed', closeReason: 'other' });
      await addWindow(tx, other, '16:00', '19:00');

      const found = await selectHoursChangeCandidates(tx, shop.shopId, now);
      expect(found.slots.map((slot) => [slot.startAt, slot.status])).toEqual([
        [kst('10:00'), 'published'],
        [kst('11:00'), 'reserved'],
      ]);
      expect(found.windows).toEqual([
        { id: open, startAt: kst('16:00'), endAt: kst('19:00'), menuNames: ['커트'] },
      ]);
    });
  });

  it("고른 매물과 시간대를 '기타'로 마감하고, 그사이 손님이 결제를 시작한 매물은 건너뛴다", async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const customer = await createTestCustomer(tx);
      const [free, held] = await tx
        .insert(slots)
        .values([
          testSlot(shop, '10:00', '11:00'),
          testSlot(shop, '11:00', '12:00', {
            holdCustomerId: customer.customerId,
            holdExpiresAt: new Date('2026-10-31T12:05:00+09:00'),
          }),
        ])
        .returning({ id: slots.id });
      const windowId = await addWindow(tx, shop, '16:00', '19:00');

      const result = await closeForHoursChange(
        tx,
        shop.shopId,
        [
          { kind: 'slot', id: free.id, startAt: '', endAt: '', label: '커트' },
          { kind: 'slot', id: held.id, startAt: '', endAt: '', label: '커트' },
          { kind: 'window', id: windowId, startAt: '', endAt: '', label: '시간대 매물' },
        ],
        now,
      );
      expect(result).toEqual({ closedSlots: 1, closedWindows: 1, skipped: 1 });

      const rows = await tx
        .select({ id: slots.id, status: slots.status, closeReason: slots.closeReason })
        .from(slots)
        .where(inArray(slots.id, [free.id, held.id]));
      expect(new Map(rows.map((row) => [row.id, [row.status, row.closeReason]]))).toEqual(
        new Map([
          [free.id, ['closed', 'other']],
          [held.id, ['published', null]],
        ]),
      );
      const [window] = await tx
        .select({ status: slotWindows.status, closeReason: slotWindows.closeReason })
        .from(slotWindows)
        .where(eq(slotWindows.id, windowId));
      expect(window).toEqual({ status: 'closed', closeReason: 'other' });
    });
  });
});
