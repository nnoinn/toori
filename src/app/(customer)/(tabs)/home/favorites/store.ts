// 찜(관심 샵) 저장·조회 (#215 2장, C-209). 매물 상세의 찜 버튼과 찜한 샵 매물 화면이 같이 쓴다. 서버에서만 부른다.
// 본인 고객 계정의 찜만 다룬다(X-102). customerId는 requireCustomer()·ensureCustomerPage()에서 받은 값을 넘긴다

import 'server-only';

import { and, count, eq } from 'drizzle-orm';

import type { getDb } from '@/db';
import { favorites, shops } from '@/db/schema';
import { customerVisibleShop } from '@/server/shops/visibility';

type Db = Pick<ReturnType<typeof getDb>, 'select' | 'insert' | 'delete'>;

/** 이 샵을 찜했는지 */
export async function isFavoriteShop(db: Db, customerId: string, shopId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: favorites.id })
    .from(favorites)
    .where(and(eq(favorites.customerId, customerId), eq(favorites.shopId, shopId)))
    .limit(1);
  return row !== undefined;
}

/** 찜한 샵 수. 찜한 뒤 고객에게 보이지 않게 된 샵(승인된 샵이 아님)은 세지 않는다 */
export async function countFavoriteShops(db: Db, customerId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(favorites)
    .innerJoin(shops, eq(shops.id, favorites.shopId))
    .where(and(eq(favorites.customerId, customerId), customerVisibleShop()));
  return row?.count ?? 0;
}

/** 찜하기. 이미 찜했으면 그대로 둔다. 고객에게 보이지 않는 샵이면 저장하지 않고 false */
export async function addFavorite(db: Db, customerId: string, shopId: string): Promise<boolean> {
  const [shop] = await db
    .select({ id: shops.id })
    .from(shops)
    .where(and(eq(shops.id, shopId), customerVisibleShop()))
    .limit(1);
  if (!shop) return false;
  await db.insert(favorites).values({ customerId, shopId }).onConflictDoNothing();
  return true;
}

/** 찜 풀기. 찜하지 않았으면 아무것도 하지 않는다 */
export async function removeFavorite(db: Db, customerId: string, shopId: string): Promise<void> {
  await db
    .delete(favorites)
    .where(and(eq(favorites.customerId, customerId), eq(favorites.shopId, shopId)));
}
