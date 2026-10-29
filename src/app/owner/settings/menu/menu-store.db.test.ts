// 메뉴 추가·수정·숨김·순서가 그 샵 메뉴만 약속대로 바꾸는지 실제 DB로 본다(O3, S-106).
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { slots } from '@/db/schema';

import { createTestShop, testSlot } from '../../../../../tests/db/fixtures';
import {
  closeTestDb,
  describeDb,
  type TestTx,
  withRollback,
} from '../../../../../tests/db/test-db';
import type { MenuValues } from './menu';
import {
  insertMenu,
  moveMenu,
  selectMenu,
  selectMenus,
  selectShopCategory,
  setMenuHidden,
  updateMenu,
} from './menu-store';

afterAll(closeTestDb);

const now = new Date('2026-10-31T12:00:00+09:00');

const values = (overrides: Partial<MenuValues> = {}): MenuValues => ({
  serviceType: 'perm',
  name: '디지털 펌',
  listPrice: 80000,
  durationMinutes: 150,
  description: '커트 포함',
  ...overrides,
});

const names = async (tx: TestTx, shopId: string) =>
  (await selectMenus(tx, shopId)).map((menu) => `${menu.name}${menu.hidden ? '(숨김)' : ''}`);

describeDb('메뉴·가격표 (실제 DB)', () => {
  it('업종과 메뉴 목록을 읽고, 새 메뉴는 맨 뒤에 붙는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      expect(await selectShopCategory(tx, shop.shopId)).toBe('hair');
      expect(await selectShopCategory(tx, crypto.randomUUID())).toBeNull();

      await insertMenu(tx, shop.shopId, values());
      const menus = await selectMenus(tx, shop.shopId);
      expect(menus.map((menu) => menu.name)).toEqual(['커트', '디지털 펌']);
      expect(menus[1]).toMatchObject({
        serviceType: 'perm',
        listPrice: 80000,
        durationMinutes: 150,
        description: '커트 포함',
        hidden: false,
      });
    });
  });

  it('메뉴를 고쳐도 이미 올린 매물은 등록 당시 값 그대로다(D12)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      await tx.insert(slots).values(testSlot(shop, '10:00', '11:00'));

      expect(
        await updateMenu(tx, shop.shopId, shop.menuId, values({ name: '프리미엄 커트' })),
      ).toBe(true);
      expect(await names(tx, shop.shopId)).toEqual(['프리미엄 커트']);
      const [slot] = await tx.select().from(slots).where(eq(slots.shopId, shop.shopId));
      expect(slot).toMatchObject({ menuName: '커트', listPrice: 20000 });
    });
  });

  it('다른 샵의 메뉴는 고치거나 숨기거나 옮길 수 없다', async () => {
    await withRollback(async (tx) => {
      const mine = await createTestShop(tx);
      const other = await createTestShop(tx);
      expect(await updateMenu(tx, mine.shopId, other.menuId, values())).toBe(false);
      expect(await setMenuHidden(tx, mine.shopId, other.menuId, true, now)).toBe(false);
      expect(await moveMenu(tx, mine.shopId, other.menuId, 'up')).toBe(false);
      expect(await selectMenu(tx, mine.shopId, other.menuId)).toBeNull();
      expect(await names(tx, other.shopId)).toEqual(['커트']);
    });
  });

  it('숨긴 메뉴는 뒤로 가고, 다시 보이면 보이는 목록 맨 뒤로 온다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      await insertMenu(tx, shop.shopId, values({ name: '펌' }));
      await insertMenu(tx, shop.shopId, values({ name: '염색', serviceType: 'color' }));

      await setMenuHidden(tx, shop.shopId, shop.menuId, true, now);
      expect(await names(tx, shop.shopId)).toEqual(['펌', '염색', '커트(숨김)']);
      expect(await selectMenu(tx, shop.shopId, shop.menuId)).toEqual({
        serviceType: 'cut',
        hidden: true,
      });

      await setMenuHidden(tx, shop.shopId, shop.menuId, false, now);
      expect(await names(tx, shop.shopId)).toEqual(['펌', '염색', '커트']);
    });
  });

  it('보이는 메뉴를 한 칸씩 옮기고, 맨 위·맨 아래에서는 그대로다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const perm = await insertMenu(tx, shop.shopId, values({ name: '펌' }));
      const color = await insertMenu(tx, shop.shopId, values({ name: '염색' }));

      expect(await moveMenu(tx, shop.shopId, color, 'up')).toBe(true);
      expect(await names(tx, shop.shopId)).toEqual(['커트', '염색', '펌']);
      expect(await moveMenu(tx, shop.shopId, shop.menuId, 'down')).toBe(true);
      expect(await names(tx, shop.shopId)).toEqual(['염색', '커트', '펌']);
      expect(await moveMenu(tx, shop.shopId, perm, 'down')).toBe(true);
      expect(await names(tx, shop.shopId)).toEqual(['염색', '커트', '펌']);

      // 숨긴 메뉴는 옮기지 않는다
      await setMenuHidden(tx, shop.shopId, perm, true, now);
      expect(await moveMenu(tx, shop.shopId, perm, 'up')).toBe(false);
    });
  });
});
