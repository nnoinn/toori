// 샵 프로필 조회 (C-309). 이 화면에서만 쓰는 서버 코드라 화면 폴더에 둔다.
// 승인된 샵만 보인다(customerVisibleShop). 승인 대기·반려·탈퇴한 샵과 없는 샵은 null(404)이다.
// 지금 매물은 매물 목록과 같은 조회(selectSlotPage)를 그 샵으로 좁혀 쓴다(게시중·신규 고객 전용 서버 판별·시간대 포함).
// DB를 받아서 테스트(withRollback)에서도 같은 조회를 쓸 수 있게 했다.

import 'server-only';

import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import { menus, shops } from '@/db/schema';
import { EMPTY_FILTERS } from '@/features/map/filters';
import { selectSlotPage } from '@/features/map/slot-list/queries';
import type { ListItem } from '@/features/map/slot-list/types';
import { categoryLabel } from '@/server/policy';
import { customerVisibleShop } from '@/server/shops/visibility';

import { type DbReader, selectShopImageUrls } from '../../slots/[slotId]/queries';
import type { ShopProfile } from './types';

export async function selectPublicShopProfile(
  db: DbReader,
  query: { shopId: string },
): Promise<ShopProfile | null> {
  const [row] = await db
    .select({
      shopId: shops.id,
      name: shops.name,
      category: shops.category,
      sigunguCode: shops.sigunguCode,
      roadAddress: shops.roadAddress,
      addressDetail: shops.addressDetail,
      phone: shops.phone,
      lat: sql<number>`ST_Y(${shops.location}::geometry)`.mapWith(Number),
      lng: sql<number>`ST_X(${shops.location}::geometry)`.mapWith(Number),
      businessHours: shops.businessHours,
      description: shops.description,
      instagramUrl: shops.instagramUrl,
      naverPlaceUrl: shops.naverPlaceUrl,
      businessName: shops.businessName,
      representativeName: shops.representativeName,
      businessRegistrationNumber: shops.businessRegistrationNumber,
    })
    .from(shops)
    .where(and(eq(shops.id, query.shopId), customerVisibleShop()))
    .limit(1);
  if (!row) return null;

  const [imageUrls, menuRows] = await Promise.all([
    selectShopImageUrls(db, row.shopId),
    // 원장님이 숨긴 메뉴는 빼고, 원장님이 정한 순서대로
    db
      .select({ menuId: menus.id, name: menus.name, listPrice: menus.listPrice })
      .from(menus)
      .where(and(eq(menus.shopId, row.shopId), isNull(menus.hiddenAt)))
      .orderBy(asc(menus.sortOrder), asc(menus.createdAt)),
  ]);

  return {
    shop: {
      shopId: row.shopId,
      name: row.name,
      roadAddress: row.roadAddress,
      addressDetail: row.addressDetail,
      phone: row.phone,
      lat: row.lat,
      lng: row.lng,
      businessHours: row.businessHours,
      description: row.description,
      instagramUrl: row.instagramUrl,
      naverPlaceUrl: row.naverPlaceUrl,
    },
    category: categoryLabel(row.category),
    sigunguCode: row.sigunguCode,
    imageUrls,
    menus: menuRows,
    seller: {
      businessName: row.businessName,
      representativeName: row.representativeName,
      businessRegistrationNumber: row.businessRegistrationNumber,
      roadAddress: row.roadAddress,
      addressDetail: row.addressDetail,
      phone: row.phone,
    },
  };
}

/**
 * 이 샵에 지금 올라온 매물(시간대 포함), 시작이 가까운 순. 매물 목록과 같은 조건이라
 * 신규 고객 전용은 그 샵 이력이 있는 고객에게 빠진다(C-306, 서버 판별). 한 번에 한 쪽(목록과 같은 수)만 보여 준다
 */
export async function selectShopSlots(
  db: DbReader,
  query: { profile: ShopProfile; customerId: string | null; now: Date },
): Promise<ListItem[]> {
  const { shop, sigunguCode } = query.profile;
  const page = await selectSlotPage(db, {
    sigunguCode,
    filters: EMPTY_FILTERS,
    customerId: query.customerId,
    now: query.now,
    origin: { lat: shop.lat, lng: shop.lng },
    sort: 'imminent',
    cursor: null,
    shopId: shop.shopId,
  });
  return page.items;
}
