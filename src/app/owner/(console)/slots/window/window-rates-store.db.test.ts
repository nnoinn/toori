// 시간대 매물 할인율 저장이 내 샵의 판매 중 시간대만 바꾸고, 이미 만든 칸 가격은 그대로 두는지 실제 DB로 본다(11/16 정민석).
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { slots, slotWindowMenus, slotWindows } from '@/db/schema';

import { createTestShop, type TestShop, testSlot } from '../../../../../../tests/db/fixtures';
import {
  closeTestDb,
  describeDb,
  type TestTx,
  withRollback,
} from '../../../../../../tests/db/test-db';
import { updateWindowRatesInDb } from './window-rates-store';

afterAll(closeTestDb);

// 시간대 날짜(2026-11-01) 전날
const now = new Date('2026-10-31T12:00:00+09:00');
const kst = (hm: string) => new Date(`2026-11-01T${hm}:00+09:00`);

/** 시간대 한 줄과 서비스 하나(커트 20,000원, 30%)를 넣는다 */
async function addWindow(
  tx: TestTx,
  shop: TestShop,
  extra: Partial<typeof slotWindows.$inferInsert> = {},
) {
  const [row] = await tx
    .insert(slotWindows)
    .values({
      shopId: shop.shopId,
      startAt: kst('10:00'),
      endAt: kst('14:00'),
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

const menuOf = async (tx: TestTx, windowId: string) => {
  const [menu] = await tx
    .select({ discountRate: slotWindowMenus.discountRate, salePrice: slotWindowMenus.salePrice })
    .from(slotWindowMenus)
    .where(eq(slotWindowMenus.windowId, windowId));
  return menu;
};

describeDb('시간대 매물 할인율 저장 (실제 DB)', () => {
  it('서비스 할인율·할인가를 바꾸고, 이미 만든 칸(예약·결제 중)의 가격은 그대로 둔다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const windowId = await addWindow(tx, shop);
      // 시간대 안에서 이미 만든 칸(30%, 14,000원)
      const [cell] = await tx
        .insert(slots)
        .values(testSlot(shop, '10:00', '11:00', { windowId, status: 'reserved' }))
        .returning({ id: slots.id });

      const result = await updateWindowRatesInDb(
        tx,
        shop.shopId,
        { windowId, rates: [{ menuId: shop.menuId, discountRate: 50 }] },
        now,
      );
      expect(result).toEqual({ ok: true, data: { changed: 1 } });
      expect(await menuOf(tx, windowId)).toEqual({ discountRate: 50, salePrice: 10000 });
      const [kept] = await tx
        .select({ discountRate: slots.discountRate, salePrice: slots.salePrice })
        .from(slots)
        .where(eq(slots.id, cell.id));
      expect(kept).toEqual({ discountRate: 30, salePrice: 14000 });
    });
  });

  it('남의 시간대, 마감했거나 끝난 시간대, 서비스가 다른 요청은 막고 값을 바꾸지 않는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const other = await createTestShop(tx);
      const mine = await addWindow(tx, shop);
      const closed = await addWindow(tx, shop, {
        startAt: kst('15:00'),
        endAt: kst('17:00'),
        status: 'closed',
        closeReason: 'other',
      });
      const ended = await addWindow(tx, shop, {
        startAt: new Date('2026-10-31T09:00:00+09:00'),
        endAt: new Date('2026-10-31T11:00:00+09:00'),
      });
      const rates = [{ menuId: shop.menuId, discountRate: 50 }];
      const update = (shopId: string, windowId: string, body = rates) =>
        updateWindowRatesInDb(tx, shopId, { windowId, rates: body }, now);

      expect(await update(other.shopId, mine)).toMatchObject({
        ok: false,
        error: { code: 'WINDOW_NOT_FOUND' },
      });
      expect(await update(shop.shopId, closed)).toMatchObject({
        ok: false,
        error: { code: 'WINDOW_CLOSED' },
      });
      expect(await update(shop.shopId, ended)).toMatchObject({
        ok: false,
        error: { code: 'WINDOW_CLOSED' },
      });
      expect(
        await update(shop.shopId, mine, [{ menuId: other.menuId, discountRate: 50 }]),
      ).toMatchObject({
        ok: false,
        error: { code: 'MENUS_CHANGED' },
      });
      expect(await menuOf(tx, mine)).toEqual({ discountRate: 30, salePrice: 14000 });
    });
  });
});
