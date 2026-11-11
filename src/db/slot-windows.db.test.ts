// 시간대 매물(slot_windows, #308)의 겹침 막기를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다 (마이그레이션 0011).
// - 시간대끼리: EXCLUDE 제약 slot_windows_no_overlap
// - 한 시술 매물 → 시간대: 트리거 slots_no_window_overlap(오류 이름은 slots_no_overlap)
// - 시간대 → 매물: 트리거 slot_windows_no_slot_overlap(오류 이름은 slot_windows_no_overlap)

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { slots, slotWindowMenus, slotWindows } from '@/db/schema';

import { createTestShop, type TestShop, testSlot } from '../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../tests/db/test-db';

/** 'HH:MM'(2026-11-01, 한국 시간) */
const at = (hm: string) => new Date(`2026-11-01T${hm}:00+09:00`);

/** savepoint 안에서 돌려 막혔으면 어긴 제약 이름, 통과했으면 null. 바깥 트랜잭션은 계속 쓸 수 있다 */
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

function windowRow(
  shop: TestShop,
  start: string,
  end: string,
  extra: Partial<typeof slotWindows.$inferInsert> = {},
) {
  return {
    shopId: shop.shopId,
    startAt: at(start),
    endAt: at(end),
    publishAt: new Date('2026-10-30T10:00:00+09:00'),
    status: 'published',
    createdBy: shop.createdBy,
    ...extra,
  } satisfies typeof slotWindows.$inferInsert;
}

async function insertWindow(
  tx: TestTx,
  shop: TestShop,
  start: string,
  end: string,
  extra: Partial<typeof slotWindows.$inferInsert> = {},
) {
  const [row] = await tx
    .insert(slotWindows)
    .values(windowRow(shop, start, end, extra))
    .returning({ id: slotWindows.id });
  return row.id;
}

describeDb('시간대 매물 겹침 막기 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('같은 샵의 예약대기·게시중 시간대끼리는 겹칠 수 없다. 이어 붙이기·마감한 시간대·다른 샵은 된다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const other = await createTestShop(tx, { status: 'approved' });
      await insertWindow(tx, shop, '13:00', '18:00');

      expect(
        await violated(tx, (t) => t.insert(slotWindows).values(windowRow(shop, '17:00', '19:00'))),
      ).toBe('slot_windows_no_overlap');
      expect(
        await violated(tx, (t) =>
          t.insert(slotWindows).values(windowRow(shop, '15:00', '16:00', { status: 'scheduled' })),
        ),
      ).toBe('slot_windows_no_overlap');
      // 끝과 시작이 같으면 겹치지 않는다(10:00~12:00과 13:00~18:00처럼 점심시간을 빼고 이어 올린다)
      expect(
        await violated(tx, (t) => t.insert(slotWindows).values(windowRow(shop, '18:00', '20:00'))),
      ).toBeNull();
      expect(
        await violated(tx, (t) =>
          t.insert(slotWindows).values(windowRow(shop, '13:00', '18:00', { status: 'closed' })),
        ),
      ).toBeNull();
      expect(
        await violated(tx, (t) => t.insert(slotWindows).values(windowRow(other, '13:00', '18:00'))),
      ).toBeNull();
    });
  });

  it('한 시술 매물은 예약대기·게시중 시간대와 겹치면 slots_no_overlap으로 막힌다(마감한 시간대는 괜찮다)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const windowId = await insertWindow(tx, shop, '13:00', '18:00');

      expect(
        await violated(tx, (t) => t.insert(slots).values(testSlot(shop, '17:00', '18:00'))),
      ).toBe('slots_no_overlap');
      expect(
        await violated(tx, (t) =>
          t.insert(slots).values(testSlot(shop, '12:00', '13:30', { status: 'scheduled' })),
        ),
      ).toBe('slots_no_overlap');
      expect(
        await violated(tx, (t) => t.insert(slots).values(testSlot(shop, '18:00', '19:00'))),
      ).toBeNull();

      // 마감한(closed) 매물은 겹쳐도 저장된다(제약 밖)
      expect(
        await violated(tx, (t) =>
          t.insert(slots).values(testSlot(shop, '14:00', '15:00', { status: 'closed' })),
        ),
      ).toBeNull();

      // 시간대를 마감하면 그 시간에 한 시술 매물을 올릴 수 있다
      await tx.update(slotWindows).set({ status: 'closed' }).where(eq(slotWindows.id, windowId));
      expect(
        await violated(tx, (t) => t.insert(slots).values(testSlot(shop, '15:00', '16:00'))),
      ).toBeNull();
    });
  });

  it('시간대 안에서 만든 매물(window_id)은 그 시간대와 겹쳐도 되고, 그 매물끼리는 slots_no_overlap이 막는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const windowId = await insertWindow(tx, shop, '13:00', '18:00');

      expect(
        await violated(tx, (t) =>
          t
            .insert(slots)
            .values(testSlot(shop, '13:00', '15:00', { windowId, status: 'reserved' })),
        ),
      ).toBeNull();
      expect(
        await violated(tx, (t) =>
          t.insert(slots).values(testSlot(shop, '14:00', '15:00', { windowId })),
        ),
      ).toBe('slots_no_overlap');
      expect(
        await violated(tx, (t) =>
          t.insert(slots).values(testSlot(shop, '15:00', '16:00', { windowId })),
        ),
      ).toBeNull();
    });
  });

  it('시간대는 예약대기·게시중·예약됨 매물과 겹치면 막힌다(취소된 매물, 그 시간대 안 매물은 괜찮다)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      await tx.insert(slots).values(testSlot(shop, '10:00', '11:00', { status: 'reserved' }));
      await tx.insert(slots).values(testSlot(shop, '11:00', '12:00', { status: 'cancelled' }));

      expect(
        await violated(tx, (t) => t.insert(slotWindows).values(windowRow(shop, '09:00', '12:00'))),
      ).toBe('slot_windows_no_overlap');
      expect(
        await violated(tx, (t) => t.insert(slotWindows).values(windowRow(shop, '11:00', '13:00'))),
      ).toBeNull();

      // 마감한 시간대는 검사하지 않고, 다시 게시중으로 바꾸면 검사한다
      const closedId = await insertWindow(tx, shop, '09:00', '12:00', { status: 'closed' });
      expect(
        await violated(tx, (t) =>
          t.update(slotWindows).set({ status: 'published' }).where(eq(slotWindows.id, closedId)),
        ),
      ).toBe('slot_windows_no_overlap');
    });
  });

  it('끝이 시작보다 이른 시간대·매물은 트리거가 아니라 시간 순서 check 제약이 막는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      await insertWindow(tx, shop, '13:00', '18:00');
      expect(
        await violated(tx, (t) => t.insert(slotWindows).values(windowRow(shop, '20:00', '19:00'))),
      ).toBe('slot_windows_time_order_check');
      expect(
        await violated(tx, (t) =>
          t.insert(slots).values({
            ...testSlot(shop, '14:00', '15:00'),
            startAt: at('15:00'),
            endAt: at('14:00'),
          }),
        ),
      ).toBe('slots_time_order_check');
    });
  });

  it('시간대에 올린 서비스는 메뉴당 한 번, 할인율 10~50', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const windowId = await insertWindow(tx, shop, '13:00', '18:00');
      const menu = {
        windowId,
        menuId: shop.menuId,
        serviceType: 'cut',
        menuName: '커트',
        listPrice: 20000,
        durationMinutes: 60,
        discountRate: 30,
        salePrice: 14000,
      } satisfies typeof slotWindowMenus.$inferInsert;
      await tx.insert(slotWindowMenus).values(menu);

      expect(await violated(tx, (t) => t.insert(slotWindowMenus).values(menu))).toBe(
        'slot_window_menus_window_id_menu_id_unique',
      );
      const second = await createTestShop(tx, { status: 'approved' });
      const otherWindow = await insertWindow(tx, second, '13:00', '18:00');
      expect(
        await violated(tx, (t) =>
          t
            .insert(slotWindowMenus)
            .values({ ...menu, windowId: otherWindow, menuId: second.menuId, discountRate: 60 }),
        ),
      ).toBe('slot_window_menus_discount_rate_check');
    });
  });
});
