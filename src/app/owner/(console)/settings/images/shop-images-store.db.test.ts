// 샵 사진·링크 저장이 장수·순서·샵 구분을 약속대로 지키는지 실제 DB로 본다(O6, S-104·S-105).
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { menus, shopImages } from '@/db/schema';

import { createTestShop } from '../../../../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../../../../tests/db/test-db';
import { SHOP_IMAGE_LIMITS } from './shop-images';
import {
  deleteShopImage,
  insertShopImage,
  moveStyleImage,
  selectShopImages,
  selectShopLinks,
  setStyleImageMenu,
  updateShopLinks,
} from './shop-images-store';

afterAll(closeTestDb);

const path = (shopId: string, n: number) =>
  `${shopId}/00000000-0000-4000-8000-${String(n).padStart(12, '0')}.jpg`;

describeDb('샵 사진·링크 저장 (실제 DB)', () => {
  it('대표 사진은 1장이라 새로 올리면 바꾸고, 지운 경로를 돌려준다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const first = await insertShopImage(tx, shop.shopId, {
        kind: 'main',
        path: path(shop.shopId, 1),
      });
      expect(first).toMatchObject({ ok: true, data: { replacedPaths: [] } });

      const second = await insertShopImage(tx, shop.shopId, {
        kind: 'main',
        path: path(shop.shopId, 2),
      });
      expect(second).toMatchObject({ ok: true, data: { replacedPaths: [path(shop.shopId, 1)] } });
      expect(await selectShopImages(tx, shop.shopId)).toEqual([
        expect.objectContaining({ kind: 'main', storagePath: path(shop.shopId, 2) }),
      ]);
    });
  });

  it('스타일 사진은 뒤에 붙고, 최대 장수를 넘으면 막는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      for (let n = 1; n <= SHOP_IMAGE_LIMITS.style; n += 1) {
        const saved = await insertShopImage(tx, shop.shopId, {
          kind: 'style',
          path: path(shop.shopId, n),
        });
        expect(saved.ok).toBe(true);
      }
      expect(
        await insertShopImage(tx, shop.shopId, { kind: 'style', path: path(shop.shopId, 99) }),
      ).toMatchObject({ ok: false, error: { code: 'STYLE_LIMIT' } });

      // 대표 사진은 스타일 장수와 따로 센다
      expect(
        (await insertShopImage(tx, shop.shopId, { kind: 'main', path: path(shop.shopId, 100) })).ok,
      ).toBe(true);

      const images = await selectShopImages(tx, shop.shopId);
      expect(images[0].kind).toBe('main');
      expect(images.slice(1).map((image) => image.storagePath)).toEqual(
        Array.from({ length: SHOP_IMAGE_LIMITS.style }, (_, i) => path(shop.shopId, i + 1)),
      );
    });
  });

  it('같은 파일을 두 번 저장하면 한 행만 남는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const input = { kind: 'style' as const, path: path(shop.shopId, 1) };
      const first = await insertShopImage(tx, shop.shopId, input);
      const second = await insertShopImage(tx, shop.shopId, input);
      expect(first.ok && second.ok && second.data.imageId).toBe(first.ok && first.data.imageId);
      expect(await selectShopImages(tx, shop.shopId)).toHaveLength(1);
    });
  });

  it('스타일 사진 순서를 바꾸고, 맨 앞은 더 앞으로 가지 않는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const ids: string[] = [];
      for (const n of [1, 2, 3]) {
        const saved = await insertShopImage(tx, shop.shopId, {
          kind: 'style',
          path: path(shop.shopId, n),
        });
        if (saved.ok) ids.push(saved.data.imageId);
      }
      const order = async () => (await selectShopImages(tx, shop.shopId)).map((image) => image.id);

      expect(await moveStyleImage(tx, shop.shopId, ids[2], 'up')).toBe(true);
      expect(await order()).toEqual([ids[0], ids[2], ids[1]]);
      expect(await moveStyleImage(tx, shop.shopId, ids[0], 'up')).toBe(true);
      expect(await order()).toEqual([ids[0], ids[2], ids[1]]);
      expect(await moveStyleImage(tx, shop.shopId, ids[0], 'down')).toBe(true);
      expect(await order()).toEqual([ids[2], ids[0], ids[1]]);
    });
  });

  it('다른 샵 사진은 지우거나 옮기거나 메뉴를 바꿀 수 없다', async () => {
    await withRollback(async (tx) => {
      const mine = await createTestShop(tx);
      const other = await createTestShop(tx);
      const saved = await insertShopImage(tx, other.shopId, {
        kind: 'style',
        path: path(other.shopId, 1),
      });
      if (!saved.ok) throw new Error('준비 실패');
      const imageId = saved.data.imageId;

      expect(await deleteShopImage(tx, mine.shopId, imageId)).toBeNull();
      expect(await moveStyleImage(tx, mine.shopId, imageId, 'up')).toBe(false);
      expect(await setStyleImageMenu(tx, mine.shopId, imageId, null)).toMatchObject({
        error: { code: 'IMAGE_NOT_FOUND' },
      });
      expect(await selectShopImages(tx, other.shopId)).toHaveLength(1);

      // 내 샵 사진이면 지우고 경로를 돌려준다
      expect(await deleteShopImage(tx, other.shopId, imageId)).toBe(path(other.shopId, 1));
      expect(await selectShopImages(tx, other.shopId)).toHaveLength(0);
    });
  });

  it('스타일 사진에 내 샵의 숨기지 않은 메뉴만 연결한다', async () => {
    await withRollback(async (tx) => {
      const mine = await createTestShop(tx);
      const other = await createTestShop(tx);
      const style = await insertShopImage(tx, mine.shopId, {
        kind: 'style',
        path: path(mine.shopId, 1),
      });
      const main = await insertShopImage(tx, mine.shopId, {
        kind: 'main',
        path: path(mine.shopId, 2),
      });
      if (!style.ok || !main.ok) throw new Error('준비 실패');

      expect((await setStyleImageMenu(tx, mine.shopId, style.data.imageId, mine.menuId)).ok).toBe(
        true,
      );
      const [linked] = await tx
        .select({ menuId: shopImages.menuId })
        .from(shopImages)
        .where(eq(shopImages.id, style.data.imageId));
      expect(linked.menuId).toBe(mine.menuId);

      expect(
        await setStyleImageMenu(tx, mine.shopId, style.data.imageId, other.menuId),
      ).toMatchObject({ error: { code: 'MENU_NOT_FOUND' } });
      // 대표 사진에는 메뉴를 연결하지 않는다
      expect(
        await setStyleImageMenu(tx, mine.shopId, main.data.imageId, mine.menuId),
      ).toMatchObject({ error: { code: 'IMAGE_NOT_FOUND' } });

      await tx.update(menus).set({ hiddenAt: new Date() }).where(eq(menus.id, mine.menuId));
      expect(
        await setStyleImageMenu(tx, mine.shopId, style.data.imageId, mine.menuId),
      ).toMatchObject({ error: { code: 'MENU_NOT_FOUND' } });
      // 연결 끊기는 된다
      expect((await setStyleImageMenu(tx, mine.shopId, style.data.imageId, null)).ok).toBe(true);
    });
  });

  it('외부 링크를 저장하고 비우면 지운다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const links = {
        instagramUrl: 'https://instagram.com/toori_shop',
        naverPlaceUrl: 'https://naver.me/abcd1234',
      };
      expect(await updateShopLinks(tx, shop.shopId, links)).toBe(true);
      expect(await selectShopLinks(tx, shop.shopId)).toEqual(links);

      await updateShopLinks(tx, shop.shopId, { instagramUrl: null, naverPlaceUrl: null });
      expect(await selectShopLinks(tx, shop.shopId)).toEqual({
        instagramUrl: null,
        naverPlaceUrl: null,
      });
    });
  });
});
