// 홈 목록·지도 매물 조회 (J4, C-201·C-204·C-205·C-206, #19 D4·D8). 이 화면에서만 쓰는 서버 코드라 화면 폴더에 둔다.
// 지금 지도에 보이는 영역 안의, 고객에게 보이는 게시중 매물만 본다. 조건 세 가지를 꼭 같이 넣는다:
//   승인 샵(customerVisibleShop, #50) · 게시중(slotStatusIs, 연결 #16) · 신규 고객 전용(newCustomerOnlyVisible, #49)
// select…는 DB를 받아서 테스트(withRollback)에서도 같은 조회를 쓸 수 있게 했다.

import 'server-only';

import { and, asc, count, desc, eq, gt, gte, inArray, lt, or, type SQL, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import { shopImages, shops, slots } from '@/db/schema';
import { slotStatusIs } from '@/features/slot-status/slot-status-sql';
import { KST_TIME_ZONE } from '@/lib/time';
import { newCustomerOnlyVisible } from '@/server/customers';
import { PRICE_FILTER_RANGES, TIME_FILTER_RANGES } from '@/server/policy';
import { customerVisibleShop } from '@/server/shops/visibility';

import type { HomeFilters } from '../filters';
import type { LatLng, MapBounds, MapShop } from '../types';
import { slotBadges } from './badges';
import { encodeCursor, SLOT_PAGE_SIZE, type SlotCursor } from './cursor';
import { shopImageUrl } from './image-url';
import type { SlotSort } from './sort';
import type { SlotListItem, SlotListPage } from './types';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

/** 지도에 한 번에 찍는 샵 수 상한. 넓게 축소해도 응답이 너무 커지지 않게 한다 */
export const MAP_SHOP_LIMIT = 300;

export type HomeSlotQuery = {
  bounds: MapBounds;
  filters: HomeFilters;
  /** 로그인한 고객 계정. 없으면(로그인 안 함, 원장님 모드) 신규 고객 전용 매물도 거르지 않는다(#49 3장) */
  customerId: string | null;
  /** 서버 시각. 상태·배지를 같은 시각으로 정한다 */
  now: Date;
};

const float = (value: number) => sql`${value}::float8`;

/** 샵 위치가 지도 영역 안 */
function inBounds({ sw, ne }: MapBounds): SQL {
  return sql`ST_Intersects(${shops.location}::geometry, ST_MakeEnvelope(${float(sw.lng)}, ${float(sw.lat)}, ${float(ne.lng)}, ${float(ne.lat)}, 4326))`;
}

/** 기준점에서 샵까지 거리(m) */
function distanceFrom({ lat, lng }: LatLng) {
  return sql<number>`ST_Distance(${shops.location}, ST_SetSRID(ST_MakePoint(${float(lng)}, ${float(lat)}), 4326)::geography)`.mapWith(
    Number,
  );
}

/** 시작 시각의 한국 시간 시(0~23) */
const startHourKst = sql<number>`extract(hour from ${slots.startAt} at time zone ${KST_TIME_ZONE})`;

type Range = { min: number | null; max: number | null };

/** 고른 구간 중 하나에 들면(min 이상 max 미만). 고른 구간이 없으면 조건 없음 */
function inAnyRange(value: SQL, ranges: readonly Range[]): SQL | undefined {
  if (ranges.length === 0) return undefined;
  return or(
    ...ranges.map(
      (range) =>
        and(
          range.min === null ? undefined : gte(value, range.min),
          range.max === null ? undefined : lt(value, range.max),
        ) ?? sql`true`,
    ),
  );
}

/** 필터(J5) → 조건 */
function filterConditions(filters: HomeFilters): (SQL | undefined)[] {
  return [
    filters.category ? eq(shops.category, filters.category) : undefined,
    filters.services.length > 0 ? inArray(slots.serviceType, filters.services) : undefined,
    inAnyRange(
      sql`${slots.salePrice}`,
      PRICE_FILTER_RANGES.filter((range) => filters.prices.includes(range.key)),
    ),
    inAnyRange(
      startHourKst,
      TIME_FILTER_RANGES.filter((range) => filters.times.includes(range.key)),
    ),
    filters.minDiscount === null ? undefined : gte(slots.discountRate, filters.minDiscount),
  ];
}

/** 홈 목록·지도에 보이는 매물 조건 */
function visibleSlotConditions(query: HomeSlotQuery): SQL {
  return and(
    customerVisibleShop(),
    slotStatusIs('published', query.now),
    newCustomerOnlyVisible(query.customerId),
    inBounds(query.bounds),
    ...filterConditions(query.filters),
  )!;
}

/** 지도 마커: 영역 안 샵별 매물 수. 가까운 순이 아니라 매물 많은 순으로 상한까지 */
export async function selectMapShops(db: DbReader, query: HomeSlotQuery): Promise<MapShop[]> {
  const slotCount = count();
  const rows = await db
    .select({
      shopId: shops.id,
      name: shops.name,
      lat: sql<number>`ST_Y(${shops.location}::geometry)`.mapWith(Number),
      lng: sql<number>`ST_X(${shops.location}::geometry)`.mapWith(Number),
      slotCount,
    })
    .from(slots)
    .innerJoin(shops, eq(shops.id, slots.shopId))
    .where(visibleSlotConditions(query))
    .groupBy(shops.id)
    .orderBy(desc(slotCount), asc(shops.id))
    .limit(MAP_SHOP_LIMIT);
  return rows;
}

export type SlotPageQuery = HomeSlotQuery & {
  /** 거리순 기준점: 내 위치, 없으면 고른 동네 중심(D4) */
  origin: LatLng;
  sort: SlotSort;
  cursor: SlotCursor | null;
  /** 마커를 눌러 고른 샵. 없으면 영역 안 전체 */
  shopId: string | null;
};

/** 목록 한 쪽(20개, D8). 정렬은 DB에서 하고, 같은 정렬 값끼리는 매물 ID 순으로 순서를 정한다 */
export async function selectSlotPage(db: DbReader, query: SlotPageQuery): Promise<SlotListPage> {
  const distance = distanceFrom(query.origin);
  const { cursor } = query;

  // 정렬 순서와, 커서(마지막으로 본 매물) 다음부터 가져오는 조건. 같은 정렬 값끼리는 매물 ID 오름차순
  let order: SQL[];
  let afterCursor: SQL | undefined;
  switch (query.sort) {
    case 'near': {
      order = [asc(distance), asc(slots.id)];
      if (cursor) {
        const value = float(Number(cursor.value));
        afterCursor = or(gt(distance, value), and(eq(distance, value), gt(slots.id, cursor.id)));
      }
      break;
    }
    case 'discount': {
      order = [desc(slots.discountRate), asc(slots.id)];
      if (cursor) {
        const value = Number(cursor.value);
        afterCursor = or(
          lt(slots.discountRate, value),
          and(eq(slots.discountRate, value), gt(slots.id, cursor.id)),
        );
      }
      break;
    }
    case 'imminent': {
      order = [asc(slots.startAt), asc(slots.id)];
      if (cursor) {
        const value = new Date(cursor.value);
        afterCursor = or(
          gt(slots.startAt, value),
          and(eq(slots.startAt, value), gt(slots.id, cursor.id)),
        );
      }
      break;
    }
  }

  const rows = await db
    .select({
      slotId: slots.id,
      shopId: slots.shopId,
      shopName: shops.name,
      menuName: slots.menuName,
      startAt: slots.startAt,
      listPrice: slots.listPrice,
      salePrice: slots.salePrice,
      discountRate: slots.discountRate,
      newCustomerOnly: slots.newCustomerOnly,
      holdCustomerId: slots.holdCustomerId,
      holdExpiresAt: slots.holdExpiresAt,
      distanceMeters: distance,
      imagePath: sql<
        string | null
      >`(select ${shopImages.storagePath} from ${shopImages} where ${shopImages.shopId} = ${shops.id} and ${shopImages.kind} = 'main' order by ${shopImages.sortOrder} limit 1)`,
    })
    .from(slots)
    .innerJoin(shops, eq(shops.id, slots.shopId))
    .where(
      and(
        visibleSlotConditions(query),
        query.shopId ? eq(slots.shopId, query.shopId) : undefined,
        afterCursor,
      ),
    )
    .orderBy(...order)
    .limit(SLOT_PAGE_SIZE + 1);

  const pageRows = rows.slice(0, SLOT_PAGE_SIZE);
  const items = pageRows.map((row) => toListItem(row, query));
  const last = pageRows.at(-1);
  const nextCursor =
    rows.length > SLOT_PAGE_SIZE && last
      ? encodeCursor(
          query.sort === 'near'
            ? { sort: 'near', value: last.distanceMeters, id: last.slotId }
            : query.sort === 'discount'
              ? { sort: 'discount', value: last.discountRate, id: last.slotId }
              : { sort: 'imminent', value: last.startAt.toISOString(), id: last.slotId },
        )
      : null;
  return { items, nextCursor };
}

type SlotRow = {
  slotId: string;
  shopId: string;
  shopName: string;
  menuName: string;
  startAt: Date;
  listPrice: number;
  salePrice: number;
  discountRate: number;
  newCustomerOnly: boolean;
  holdCustomerId: string | null;
  holdExpiresAt: Date | null;
  distanceMeters: number;
  imagePath: string | null;
};

/** 배지는 서버 시각으로 정한다(공통 UI SlotCard 규칙, badges.ts) */
function toListItem(row: SlotRow, query: Pick<HomeSlotQuery, 'customerId' | 'now'>): SlotListItem {
  return {
    slotId: row.slotId,
    shopId: row.shopId,
    shopName: row.shopName,
    menuName: row.menuName,
    startAt: row.startAt.toISOString(),
    listPrice: row.listPrice,
    salePrice: row.salePrice,
    discountRate: row.discountRate,
    imageUrl: shopImageUrl(row.imagePath),
    distanceMeters: row.distanceMeters,
    badges: slotBadges(row, query.customerId, query.now),
  };
}
