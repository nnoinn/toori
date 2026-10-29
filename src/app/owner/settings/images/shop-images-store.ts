// 매장 설정 > 사진·링크 읽기·저장 (DB, O6, S-104·S-105). 이 화면에서만 쓰는 서버 코드라 화면 폴더에 둔다(#47).
// 화면이 부르는 'use server' 함수(actions.ts)가 권한·입력·경로를 확인한 뒤 이 함수들을 부른다.
// 모든 함수는 shopId로 그 샵의 사진만 다룬다. Storage 파일 지우기는 actions.ts가 DB를 바꾼 뒤에 한다.
// 장수 제한(대표 1장·스타일 10장)은 샵 행을 잠그고 세어서, 동시에 여러 장을 올려도 넘지 않게 한다.

import 'server-only';

import { and, asc, count, eq, isNull, max } from 'drizzle-orm';

import { getDb } from '@/db';
import { menus, shopImages, shops } from '@/db/schema';
import type { ShopImageKind } from '@/db/schema/shops';
import { fail, ok, type Result } from '@/lib/result';

import { SHOP_IMAGE_ERRORS, SHOP_IMAGE_LIMITS, type ShopLinks } from './shop-images';

type Db = ReturnType<typeof getDb>;

export type ShopImage = {
  id: string;
  kind: ShopImageKind;
  storagePath: string;
  menuId: string | null;
};

const byShopAndId = (shopId: string, imageId: string) =>
  and(eq(shopImages.shopId, shopId), eq(shopImages.id, imageId));

/** 샵 사진. 대표 사진 먼저, 그다음 스타일 사진을 원장님이 정한 순서대로(고객 화면과 같은 순서) */
export async function selectShopImages(
  db: Pick<Db, 'select'>,
  shopId: string,
): Promise<ShopImage[]> {
  const rows = await db
    .select({
      id: shopImages.id,
      kind: shopImages.kind,
      storagePath: shopImages.storagePath,
      menuId: shopImages.menuId,
    })
    .from(shopImages)
    .where(eq(shopImages.shopId, shopId))
    .orderBy(asc(shopImages.kind), asc(shopImages.sortOrder), asc(shopImages.createdAt));
  // 'main' < 'style' 이라 글자 순서가 곧 대표 먼저다
  return rows.map((row) => ({ ...row, kind: row.kind as ShopImageKind }));
}

/** 샵의 외부 링크. 샵이 없으면 null */
export async function selectShopLinks(
  db: Pick<Db, 'select'>,
  shopId: string,
): Promise<ShopLinks | null> {
  const [row] = await db
    .select({ instagramUrl: shops.instagramUrl, naverPlaceUrl: shops.naverPlaceUrl })
    .from(shops)
    .where(eq(shops.id, shopId));
  return row ?? null;
}

/** 외부 링크를 저장한다. 샵이 없으면 false */
export async function updateShopLinks(
  db: Pick<Db, 'update'>,
  shopId: string,
  links: ShopLinks,
): Promise<boolean> {
  const rows = await db
    .update(shops)
    .set(links)
    .where(eq(shops.id, shopId))
    .returning({ id: shops.id });
  return rows.length > 0;
}

/**
 * 올린 사진 정보를 저장한다.
 * - 대표 사진: 있던 대표 사진을 지우고 새 사진으로 바꾼다. 지운 사진 경로를 돌려준다(Storage에서 지울 것)
 * - 스타일 사진: 맨 뒤에 더한다. 이미 10장이면 STYLE_LIMIT
 * 실패하면 아무것도 바꾸지 않는다(부른 쪽이 올린 파일을 Storage에서 지운다)
 */
export async function insertShopImage(
  db: Pick<Db, 'transaction'>,
  shopId: string,
  input: { kind: ShopImageKind; path: string },
): Promise<Result<{ imageId: string; replacedPaths: string[] }>> {
  return db.transaction(async (tx) => {
    // 같은 샵의 사진 저장을 한 줄로 세운다(동시에 올려도 장수를 넘지 않게)
    const [shop] = await tx
      .select({ id: shops.id })
      .from(shops)
      .where(eq(shops.id, shopId))
      .for('update');
    if (!shop) return fail('SHOP_NOT_FOUND', '샵을 찾을 수 없어요');

    // 같은 파일을 두 번 저장하면(두 번 누름) 이미 저장한 것을 돌려준다. 한 파일을 두 행이 같이 쓰면 한쪽을 지울 때 다른 쪽이 깨진다
    const [saved] = await tx
      .select({ id: shopImages.id })
      .from(shopImages)
      .where(and(eq(shopImages.shopId, shopId), eq(shopImages.storagePath, input.path)));
    if (saved) return ok({ imageId: saved.id, replacedPaths: [] });

    let replacedPaths: string[] = [];
    let sortOrder = 0;
    if (input.kind === 'main') {
      const removed = await tx
        .delete(shopImages)
        .where(and(eq(shopImages.shopId, shopId), eq(shopImages.kind, 'main')))
        .returning({ path: shopImages.storagePath });
      replacedPaths = removed.map((row) => row.path);
    } else {
      const [stats] = await tx
        .select({ total: count(), last: max(shopImages.sortOrder) })
        .from(shopImages)
        .where(and(eq(shopImages.shopId, shopId), eq(shopImages.kind, 'style')));
      if ((stats?.total ?? 0) >= SHOP_IMAGE_LIMITS.style) {
        return fail('STYLE_LIMIT', SHOP_IMAGE_ERRORS.STYLE_LIMIT);
      }
      sortOrder = (stats?.last ?? -1) + 1;
    }

    const [row] = await tx
      .insert(shopImages)
      .values({ shopId, kind: input.kind, storagePath: input.path, sortOrder })
      .returning({ id: shopImages.id });
    return ok({ imageId: row.id, replacedPaths });
  });
}

/** 사진을 지운다. 지운 사진 경로를 돌려준다(Storage에서 지울 것). 그 샵 사진이 아니면 null */
export async function deleteShopImage(
  db: Pick<Db, 'delete'>,
  shopId: string,
  imageId: string,
): Promise<string | null> {
  const [row] = await db
    .delete(shopImages)
    .where(byShopAndId(shopId, imageId))
    .returning({ path: shopImages.storagePath });
  return row?.path ?? null;
}

/**
 * 스타일 사진 하나를 한 칸 앞·뒤로 옮긴다. 스타일 사진 순서를 0부터 다시 매긴다.
 * 그 샵의 스타일 사진이 아니면 false, 맨 앞·맨 뒤라 못 옮기면 바꾸지 않고 true
 */
export async function moveStyleImage(
  db: Pick<Db, 'select' | 'update'>,
  shopId: string,
  imageId: string,
  direction: 'up' | 'down',
): Promise<boolean> {
  const styles = await db
    .select({ id: shopImages.id })
    .from(shopImages)
    .where(and(eq(shopImages.shopId, shopId), eq(shopImages.kind, 'style')))
    .orderBy(asc(shopImages.sortOrder), asc(shopImages.createdAt));
  const index = styles.findIndex((image) => image.id === imageId);
  if (index < 0) return false;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= styles.length) return true;

  const ordered = styles.map((image) => image.id);
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  for (const [sortOrder, id] of ordered.entries()) {
    await db.update(shopImages).set({ sortOrder }).where(byShopAndId(shopId, id));
  }
  return true;
}

/**
 * 스타일 사진에 메뉴를 연결하거나(menuId) 끊는다(null). 메뉴는 그 샵의 숨기지 않은 메뉴만.
 * 대표 사진에는 연결하지 않는다
 */
export async function setStyleImageMenu(
  db: Pick<Db, 'select' | 'update'>,
  shopId: string,
  imageId: string,
  menuId: string | null,
): Promise<Result<null>> {
  if (menuId !== null) {
    const [menu] = await db
      .select({ id: menus.id })
      .from(menus)
      .where(and(eq(menus.id, menuId), eq(menus.shopId, shopId), isNull(menus.hiddenAt)));
    if (!menu) return fail('MENU_NOT_FOUND', SHOP_IMAGE_ERRORS.MENU_NOT_FOUND);
  }
  const rows = await db
    .update(shopImages)
    .set({ menuId })
    .where(and(byShopAndId(shopId, imageId), eq(shopImages.kind, 'style')))
    .returning({ id: shopImages.id });
  if (rows.length === 0) return fail('IMAGE_NOT_FOUND', SHOP_IMAGE_ERRORS.NOT_FOUND);
  return ok(null);
}
