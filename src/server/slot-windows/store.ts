// 시간대 매물 DB 읽기 (#308). 서버에서만 부른다. 가짜 결과 버전은 샵·메뉴·매물만 읽고 시간대 표는 쓰지 않는다.
// 진짜 버전에서 시간대 표 읽기·저장을 여기에 더한다.

import 'server-only';

import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  not,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';

import type { getDb } from '@/db';
import { menus, shopImages, shops, slots, slotWindows } from '@/db/schema';
import type { BusinessHours } from '@/db/schema/shops';
import type { ServiceType, ShopCategory } from '@/server/policy';
import { customerVisibleShop } from '@/server/shops/visibility';

import { shopInArea, type WindowArea } from './conditions';
import type { ShopMenu } from './rules';
import type { Range } from './starts';
import type { SlotWindowShop } from './types';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

/** 겹침을 보는 매물 상태(S-209, slots_no_overlap과 같다) */
const BLOCKING_SLOT_STATUSES = ['scheduled', 'published', 'reserved'] as const;

/** 그 샵의 영업시간과 메뉴(숨긴 메뉴 포함, hidden으로 표시). 샵이 없으면 null */
export async function readWindowShop(
  db: DbReader,
  shopId: string,
): Promise<{ businessHours: BusinessHours; menus: ShopMenu[] } | null> {
  const [shop] = await db
    .select({ businessHours: shops.businessHours })
    .from(shops)
    .where(eq(shops.id, shopId));
  if (!shop) return null;
  const rows = await db
    .select({
      id: menus.id,
      serviceType: menus.serviceType,
      name: menus.name,
      description: menus.description,
      listPrice: menus.listPrice,
      durationMinutes: menus.durationMinutes,
      hiddenAt: menus.hiddenAt,
    })
    .from(menus)
    .where(eq(menus.shopId, shopId))
    .orderBy(asc(menus.sortOrder));
  return {
    businessHours: shop.businessHours,
    menus: rows.map(({ hiddenAt, ...menu }) => ({
      ...menu,
      // DB의 check 제약이 정해진 서비스 종류만 허용한다
      serviceType: menu.serviceType as ServiceType,
      hidden: hiddenAt !== null,
    })),
  };
}

/**
 * 그 샵에서 [from, to)와 겹치는, 이미 올린 시간: 예약대기·게시중·예약됨 매물과 예약대기·게시중 시간대.
 * 원장님 등록의 겹침 확인(WINDOW_OVERLAP)에 쓴다
 */
export async function readShopBusyRanges(
  db: DbReader,
  input: { shopId: string; from: Date; to: Date },
): Promise<Range[]> {
  const slotRows = await db
    .select({ start: slots.startAt, end: slots.endAt })
    .from(slots)
    .where(
      and(
        eq(slots.shopId, input.shopId),
        inArray(slots.status, BLOCKING_SLOT_STATUSES),
        lt(slots.startAt, input.to),
        gt(slots.endAt, input.from),
      ),
    );
  const windowRows = await db
    .select({ start: slotWindows.startAt, end: slotWindows.endAt })
    .from(slotWindows)
    .where(
      and(
        eq(slotWindows.shopId, input.shopId),
        inArray(slotWindows.status, ['scheduled', 'published']),
        lt(slotWindows.startAt, input.to),
        gt(slotWindows.endAt, input.from),
      ),
    );
  return [...slotRows, ...windowRows];
}

/**
 * 고객에게 시작 시각을 줄 때 이미 차 있는 시간: 그 샵의 예약대기·게시중·예약됨 매물.
 * 단, 시간대 안에서 손님이 만든 매물이 게시중인데 홀딩이 끝났으면(결제 없이 끝남) 비어 있는 것으로 본다(#308 ④)
 */
export async function readOccupiedRanges(
  db: DbReader,
  input: { shopId: string; from: Date; to: Date; now: Date },
): Promise<Range[]> {
  const releasedHold: SQL = and(
    isNotNull(slots.windowId),
    eq(slots.status, 'published'),
    // lte()로 비교해야 시각이 컬럼 형식으로 바뀐다(sql``에 Date를 바로 넣으면 드라이버가 받지 못한다)
    or(isNull(slots.holdExpiresAt), lte(slots.holdExpiresAt, input.now)),
  )!;
  return db
    .select({ start: slots.startAt, end: slots.endAt })
    .from(slots)
    .where(
      and(
        eq(slots.shopId, input.shopId),
        inArray(slots.status, BLOCKING_SLOT_STATUSES),
        lt(slots.startAt, input.to),
        gt(slots.endAt, input.from),
        not(releasedHold),
      ),
    );
}

/** 목록 카드에 쓰는 샵 값 */
export type AreaShop = {
  shopId: string;
  name: string;
  category: ShopCategory;
  lat: number;
  lng: number;
  /** 대표 이미지 경로(지금 매물 카드와 같은 기준). 없으면 null */
  imagePath: string | null;
};

/** 범위 안 승인된 샵(업종을 골랐으면 그 업종만), 이름 순으로 limit개까지 */
export async function readAreaShops(
  db: DbReader,
  input: { area: WindowArea; category: ShopCategory | null; limit: number },
): Promise<AreaShop[]> {
  const rows = await db
    .select({
      shopId: shops.id,
      name: shops.name,
      category: shops.category,
      lat: sql<number>`ST_Y(${shops.location}::geometry)`.mapWith(Number),
      lng: sql<number>`ST_X(${shops.location}::geometry)`.mapWith(Number),
      imagePath: sql<
        string | null
      >`(select ${shopImages.storagePath} from ${shopImages} where ${shopImages.shopId} = ${shops.id} and ${shopImages.kind} = 'main' order by ${shopImages.sortOrder} limit 1)`,
    })
    .from(shops)
    .where(
      and(
        customerVisibleShop(),
        shopInArea(input.area),
        input.category ? eq(shops.category, input.category) : undefined,
      ),
    )
    .orderBy(asc(shops.name))
    .limit(input.limit);
  // DB의 check 제약이 정해진 업종만 허용한다
  return rows.map((row) => ({ ...row, category: row.category as ShopCategory }));
}

/** 시간대 상세의 샵과 사진(지금 매물 상세와 같은 모양·순서). 승인된 샵이 아니면 null */
export async function readWindowShopProfile(
  db: DbReader,
  shopId: string,
): Promise<{ shop: SlotWindowShop; imagePaths: string[]; category: ShopCategory } | null> {
  const [row] = await db
    .select({
      shopId: shops.id,
      name: shops.name,
      category: shops.category,
      roadAddress: shops.roadAddress,
      addressDetail: shops.addressDetail,
      phone: shops.phone,
      lat: sql<number>`ST_Y(${shops.location}::geometry)`.mapWith(Number),
      lng: sql<number>`ST_X(${shops.location}::geometry)`.mapWith(Number),
      businessHours: shops.businessHours,
      description: shops.description,
      instagramUrl: shops.instagramUrl,
      naverPlaceUrl: shops.naverPlaceUrl,
    })
    .from(shops)
    .where(and(eq(shops.id, shopId), customerVisibleShop()));
  if (!row) return null;
  const images = await db
    .select({ storagePath: shopImages.storagePath })
    .from(shopImages)
    .where(eq(shopImages.shopId, shopId))
    .orderBy(
      sql`case when ${shopImages.kind} = 'main' then 0 else 1 end`,
      asc(shopImages.sortOrder),
    );
  const { category, ...shop } = row;
  return {
    shop,
    imagePaths: images.map((image) => image.storagePath),
    category: category as ShopCategory,
  };
}
