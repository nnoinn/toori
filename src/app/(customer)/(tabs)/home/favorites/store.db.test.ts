// 찜 저장·조회가 본인 찜만, 고객에게 보이는 샵만 다루는지 실제 DB로 본다(#215 2장, C-209, X-102).
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { shops } from '@/db/schema';

import { createTestCustomer, createTestShop } from '../../../../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../../../../tests/db/test-db';
import { addFavorite, countFavoriteShops, isFavoriteShop, removeFavorite } from './store';

afterAll(closeTestDb);

describeDb('찜 저장·조회', () => {
  it('찜하기·풀기는 여러 번 해도 결과가 같고, 본인 찜만 바뀐다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const other = await createTestCustomer(tx);

      expect(await addFavorite(tx, me.customerId, shop.shopId)).toBe(true);
      expect(await addFavorite(tx, me.customerId, shop.shopId)).toBe(true);
      expect(await isFavoriteShop(tx, me.customerId, shop.shopId)).toBe(true);
      expect(await countFavoriteShops(tx, me.customerId)).toBe(1);
      // 다른 고객에게는 찜이 없다
      expect(await isFavoriteShop(tx, other.customerId, shop.shopId)).toBe(false);

      await addFavorite(tx, other.customerId, shop.shopId);
      await removeFavorite(tx, me.customerId, shop.shopId);
      await removeFavorite(tx, me.customerId, shop.shopId);
      expect(await isFavoriteShop(tx, me.customerId, shop.shopId)).toBe(false);
      expect(await countFavoriteShops(tx, me.customerId)).toBe(0);
      // 내가 풀어도 다른 고객의 찜은 그대로
      expect(await isFavoriteShop(tx, other.customerId, shop.shopId)).toBe(true);
    });
  });

  it('승인되지 않은 샵은 찜하지 못하고, 찜한 뒤 보이지 않게 된 샵은 세지 않는다', async () => {
    await withRollback(async (tx) => {
      const pending = await createTestShop(tx, { status: 'pending' });
      const approved = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);

      expect(await addFavorite(tx, me.customerId, pending.shopId)).toBe(false);
      expect(await isFavoriteShop(tx, me.customerId, pending.shopId)).toBe(false);

      await addFavorite(tx, me.customerId, approved.shopId);
      expect(await countFavoriteShops(tx, me.customerId)).toBe(1);
      await tx.update(shops).set({ status: 'rejected' }).where(eq(shops.id, approved.shopId));
      expect(await countFavoriteShops(tx, me.customerId)).toBe(0);
    });
  });
});
