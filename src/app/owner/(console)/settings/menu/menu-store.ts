// 메뉴·가격표 읽기·저장 (DB, O3, S-106). 이 화면에서만 쓰는 서버 코드라 화면 폴더에 둔다.
// 화면이 부르는 'use server' 함수(actions.ts)가 권한·입력을 확인한 뒤 이 함수들을 부른다.
// db를 받아서 테스트(withRollback)에서도 같은 코드를 쓴다. 모든 함수는 shopId로 그 샵의 메뉴만 다룬다.
// 메뉴를 고치거나 숨겨도 매물은 등록 당시 값을 복사해 두었으므로 그대로다(#23 D12).

import 'server-only';

import { and, asc, eq, isNotNull, isNull, max, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import { menus, shops } from '@/db/schema';
import type { ShopCategory } from '@/server/policy';

import type { MenuValues } from './menu';

type Db = Pick<ReturnType<typeof getDb>, 'select' | 'insert' | 'update'>;

export type MenuItem = {
  id: string;
  serviceType: string;
  name: string;
  listPrice: number;
  durationMinutes: number;
  description: string | null;
  hidden: boolean;
};

const byShopAndId = (shopId: string, menuId: string) =>
  and(eq(menus.shopId, shopId), eq(menus.id, menuId));

/** 샵의 지금 업종. 샵이 없으면 null */
export async function selectShopCategory(
  db: Pick<Db, 'select'>,
  shopId: string,
): Promise<ShopCategory | null> {
  const [row] = await db
    .select({ category: shops.category })
    .from(shops)
    .where(eq(shops.id, shopId));
  return row ? (row.category as ShopCategory) : null;
}

/** 샵의 메뉴. 보이는 메뉴를 순서대로 먼저, 숨긴 메뉴는 뒤에 */
export async function selectMenus(db: Pick<Db, 'select'>, shopId: string): Promise<MenuItem[]> {
  const rows = await db
    .select({
      id: menus.id,
      serviceType: menus.serviceType,
      name: menus.name,
      listPrice: menus.listPrice,
      durationMinutes: menus.durationMinutes,
      description: menus.description,
      hidden: isNotNull(menus.hiddenAt).mapWith(Boolean),
    })
    .from(menus)
    .where(eq(menus.shopId, shopId))
    .orderBy(sql`${menus.hiddenAt} is not null`, asc(menus.sortOrder), asc(menus.createdAt));
  return rows;
}

/** 메뉴를 보이는 목록 맨 뒤에 더한다 */
export async function insertMenu(
  db: Pick<Db, 'select' | 'insert'>,
  shopId: string,
  values: MenuValues,
): Promise<string> {
  const [last] = await db
    .select({ sortOrder: max(menus.sortOrder) })
    .from(menus)
    .where(eq(menus.shopId, shopId));
  const [row] = await db
    .insert(menus)
    .values({ shopId, ...values, sortOrder: (last?.sortOrder ?? -1) + 1 })
    .returning({ id: menus.id });
  return row.id;
}

/** 메뉴를 고친다. 그 샵의 메뉴가 아니면 false */
export async function updateMenu(
  db: Pick<Db, 'update'>,
  shopId: string,
  menuId: string,
  values: MenuValues,
): Promise<boolean> {
  const rows = await db
    .update(menus)
    .set(values)
    .where(byShopAndId(shopId, menuId))
    .returning({ id: menus.id });
  return rows.length > 0;
}

/** 메뉴 한 개(숨김·다시 보이기 전 확인용). 그 샵의 메뉴가 아니면 null */
export async function selectMenu(
  db: Pick<Db, 'select'>,
  shopId: string,
  menuId: string,
): Promise<{ serviceType: string; hidden: boolean } | null> {
  const [row] = await db
    .select({
      serviceType: menus.serviceType,
      hidden: isNotNull(menus.hiddenAt).mapWith(Boolean),
    })
    .from(menus)
    .where(byShopAndId(shopId, menuId));
  return row ?? null;
}

/**
 * 메뉴를 숨기거나 다시 보이게 한다(지우지 않는다). 다시 보이면 보이는 목록 맨 뒤로 간다.
 * 그 샵의 메뉴가 아니면 false
 */
export async function setMenuHidden(
  db: Pick<Db, 'select' | 'update'>,
  shopId: string,
  menuId: string,
  hidden: boolean,
  now: Date,
): Promise<boolean> {
  let sortOrder: number | undefined;
  if (!hidden) {
    const [last] = await db
      .select({ sortOrder: max(menus.sortOrder) })
      .from(menus)
      .where(and(eq(menus.shopId, shopId), isNull(menus.hiddenAt)));
    sortOrder = (last?.sortOrder ?? -1) + 1;
  }
  const rows = await db
    .update(menus)
    .set({ hiddenAt: hidden ? now : null, ...(sortOrder === undefined ? {} : { sortOrder }) })
    .where(byShopAndId(shopId, menuId))
    .returning({ id: menus.id });
  return rows.length > 0;
}

/**
 * 보이는 메뉴 중 하나를 한 칸 위·아래로 옮긴다. 보이는 메뉴 순서를 0부터 다시 매긴다.
 * 그 샵의 보이는 메뉴가 아니면 false, 맨 위·맨 아래라 못 옮기면 바꾸지 않고 true
 */
export async function moveMenu(
  db: Pick<Db, 'select' | 'update'>,
  shopId: string,
  menuId: string,
  direction: 'up' | 'down',
): Promise<boolean> {
  const visible = await db
    .select({ id: menus.id })
    .from(menus)
    .where(and(eq(menus.shopId, shopId), isNull(menus.hiddenAt)))
    .orderBy(asc(menus.sortOrder), asc(menus.createdAt));
  const index = visible.findIndex((menu) => menu.id === menuId);
  if (index < 0) return false;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= visible.length) return true;

  const ordered = visible.map((menu) => menu.id);
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  for (const [sortOrder, id] of ordered.entries()) {
    await db.update(menus).set({ sortOrder }).where(byShopAndId(shopId, id));
  }
  return true;
}
