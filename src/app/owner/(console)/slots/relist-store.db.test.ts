// 취소 시간대 재등록이 같은 조건의 새 매물을 게시하고 원래 매물과 잇는지, 막아야 할 때 막는지 실제 DB로 본다(O13, S-408).
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { menus, slots } from '@/db/schema';

import { createTestShop, testSlot, type TestShop } from '../../../../../tests/db/fixtures';
import {
  closeTestDb,
  describeDb,
  type TestTx,
  withRollback,
} from '../../../../../tests/db/test-db';
import { relistSlotInDb, selectSlotForRelist } from './relist-store';

afterAll(closeTestDb);

// 매물 날짜(2026-11-01) 전날 낮. 11/01 전체가 48시간 안이다
const now = new Date('2026-10-31T12:00:00+09:00');

/** 고객이 취소한 매물(14:00~15:00, 30%, 신규 고객 전용) */
async function addCancelled(tx: TestTx, shop: TestShop) {
  const [row] = await tx
    .insert(slots)
    .values(testSlot(shop, '14:00', '15:00', { status: 'cancelled', newCustomerOnly: true }))
    .returning({ id: slots.id });
  return row.id;
}

describeDb('취소 시간대 재등록 (실제 DB)', () => {
  it('같은 조건의 새 매물을 바로 게시하고, 원래 매물은 취소로 남기고 잇는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const original = await addCancelled(tx, shop);

      const result = await relistSlotInDb(tx, shop.shopId, shop.createdBy, original, now);
      expect(result).toMatchObject({ ok: true, data: { salePrice: 14000 } });
      if (!result.ok) return;

      const [created] = await tx.select().from(slots).where(eq(slots.id, result.data.slotId));
      expect(created).toMatchObject({
        shopId: shop.shopId,
        menuId: shop.menuId,
        startAt: new Date('2026-11-01T14:00:00+09:00'),
        endAt: new Date('2026-11-01T15:00:00+09:00'),
        discountRate: 30,
        newCustomerOnly: true,
        listPrice: 20000,
        salePrice: 14000,
        status: 'published',
        publishAt: now,
        relistedFromSlotId: original,
      });
      const [before] = await tx.select().from(slots).where(eq(slots.id, original));
      expect(before.status).toBe('cancelled');
      expect(await selectSlotForRelist(tx, shop.shopId, original)).toMatchObject({
        relistedSlotId: result.data.slotId,
      });
    });
  });

  it('같은 매물로 두 번 재등록하지 못한다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const original = await addCancelled(tx, shop);
      await relistSlotInDb(tx, shop.shopId, shop.createdBy, original, now);
      expect(await relistSlotInDb(tx, shop.shopId, shop.createdBy, original, now)).toMatchObject({
        ok: false,
        error: { code: 'ALREADY_RELISTED' },
      });
    });
  });

  it('다른 샵 매물·없는 매물·취소가 아닌 매물·시작이 지난 매물은 막는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const other = await createTestShop(tx);
      const original = await addCancelled(tx, shop);
      const [published] = await tx
        .insert(slots)
        .values(testSlot(shop, '16:00', '17:00'))
        .returning({ id: slots.id });
      const relist = (shopId: string, slotId: string, at = now) =>
        relistSlotInDb(tx, shopId, shop.createdBy, slotId, at);

      expect(await relist(other.shopId, original)).toMatchObject({
        error: { code: 'SLOT_NOT_FOUND' },
      });
      expect(await relist(shop.shopId, 'not-a-uuid')).toMatchObject({
        error: { code: 'SLOT_NOT_FOUND' },
      });
      expect(await relist(shop.shopId, published.id)).toMatchObject({
        error: { code: 'NOT_CANCELLED' },
      });
      expect(
        await relist(shop.shopId, original, new Date('2026-11-01T14:00:00+09:00')),
      ).toMatchObject({ error: { code: 'START_PASSED' } });
    });
  });

  it('등록 확인을 다시 한다: 같은 시간 매물이 있거나 메뉴를 숨겼으면 막는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const original = await addCancelled(tx, shop);

      // 취소 뒤 같은 시간에 다른 매물을 올렸다
      const [busy] = await tx
        .insert(slots)
        .values(testSlot(shop, '14:30', '15:30'))
        .returning({ id: slots.id });
      expect(await relistSlotInDb(tx, shop.shopId, shop.createdBy, original, now)).toMatchObject({
        error: { code: 'SLOT_OVERLAP' },
      });
      // 그 매물도 취소되면 시간이 비어서 다음 확인(메뉴)까지 간다
      await tx.update(slots).set({ status: 'cancelled' }).where(eq(slots.id, busy.id));

      // 메뉴를 숨겼다
      await tx.update(menus).set({ hiddenAt: now }).where(eq(menus.id, shop.menuId));
      const hidden = await relistSlotInDb(tx, shop.shopId, shop.createdBy, original, now);
      expect(hidden).toMatchObject({ error: { code: 'MENU_NOT_FOUND' } });
      expect(!hidden.ok && hidden.error.message).toContain('매물 등록에서 새로 올려 주세요');
    });
  });
});
