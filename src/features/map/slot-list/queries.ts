// 홈 목록·지도 매물 조회 (J4, C-201·C-204·C-205·C-206, #19 D4·D8). 이 화면에서만 쓰는 서버 코드라 화면 폴더에 둔다.
// 지도는 지금 보이는 영역 안, 지도 없는 매물 목록(#215)은 고른 시·군·구 안의, 고객에게 보이는 게시중 매물만 본다.
// 조건 네 가지를 꼭 같이 넣는다:
//   승인 샵(customerVisibleShop, #50) · 게시중(slotStatusIs, 연결 #16) · 신규 고객 전용(newCustomerOnlyVisible, #49)
//   · 시간대 안에서 만든 매물이 아님(notWindowSlot, #308. 그 매물은 시간대 카드로만 보인다)
// 시간대 매물(#308)은 강규민님 listSlotWindows로 받아 같은 정렬로 섞는다(merge.ts). 지도 핀·매물 수에는 시간대를 1개씩 더한다.
// select…는 DB를 받아서 테스트(withRollback)에서도 같은 조회를 쓸 수 있게 했다.

import 'server-only';

import { and, asc, count, desc, eq, gt, gte, inArray, lt, or, type SQL, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import { favorites, shopImages, shops, slots } from '@/db/schema';
import { slotStatusIs } from '@/features/slot-status/slot-status-sql';
import { KST_TIME_ZONE } from '@/lib/time';
import { newCustomerOnlyVisible } from '@/server/customers';
import { PRICE_FILTER_RANGES, TIME_FILTER_RANGES } from '@/server/policy';
import { customerVisibleShop } from '@/server/shops/visibility';
import { listSlotWindows, notWindowSlot, type SlotWindowCard } from '@/server/slot-windows';

import { EMPTY_FILTERS, type HomeFilters } from '../filters';
import type { LatLng, MapBounds, MapShop } from '../types';
import { slotBadges, windowBadges } from './badges';
import { encodeCursor, SLOT_PAGE_SIZE, type SlotCursor } from './cursor';
import { shopImageUrl } from './image-url';
import { addWindowPins, mergePage, type SortKey } from './merge';
import type { SlotSort } from './sort';
import type { ListItem, SlotListItem, SlotListPage, WindowListItem } from './types';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

/** 지도에 한 번에 찍는 샵 수 상한. 넓게 축소해도 응답이 너무 커지지 않게 한다 */
export const MAP_SHOP_LIMIT = 300;

/** 매물을 찾는 범위: 지도 영역, 시·군·구(지도 없는 매물 목록), 그 고객이 찜한 샵(#215, C-209) */
export type SlotArea = { bounds: MapBounds } | { sigunguCode: string } | { favoritesOf: string };

/** 범위 → 조건 */
function areaCondition(area: SlotArea): SQL {
  if ('bounds' in area) return inBounds(area.bounds);
  if ('sigunguCode' in area) return eq(shops.sigunguCode, area.sigunguCode);
  return sql`${slots.shopId} in (select ${favorites.shopId} from ${favorites} where ${favorites.customerId} = ${area.favoritesOf})`;
}

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

/** 범위(지도 영역 또는 시·군·구)와 필터·로그인·시각 */
export type VisibleSlotQuery = Omit<HomeSlotQuery, 'bounds'> & SlotArea;

/** 홈 목록·지도·매물 목록에 보이는 매물 조건 */
function visibleSlotConditions(query: VisibleSlotQuery): SQL {
  return and(
    customerVisibleShop(),
    slotStatusIs('published', query.now),
    newCustomerOnlyVisible(query.customerId),
    notWindowSlot(),
    areaCondition(query),
    ...filterConditions(query.filters),
  )!;
}

/** 범위 안 시간대 카드(#308). 매물과 같은 범위·필터·로그인·시각으로 부른다 */
function visibleWindows(db: DbReader, query: VisibleSlotQuery): Promise<SlotWindowCard[]> {
  const { filters, customerId, now } = query;
  const area: SlotArea =
    'bounds' in query
      ? { bounds: query.bounds }
      : 'sigunguCode' in query
        ? { sigunguCode: query.sigunguCode }
        : { favoritesOf: query.favoritesOf };
  return listSlotWindows(db, { ...area, filters, customerId, now });
}

/** 시간대가 있는 샵의 시·군·구와 기준점에서의 거리(매물과 같은 계산). 기준점이 없으면 거리는 null */
async function selectWindowShops(
  db: DbReader,
  shopIds: string[],
  origin: LatLng | null,
): Promise<Map<string, { sigunguCode: string; distanceMeters: number | null }>> {
  if (shopIds.length === 0) return new Map();
  const rows = await db
    .select({
      shopId: shops.id,
      sigunguCode: shops.sigunguCode,
      distanceMeters: origin ? distanceFrom(origin) : sql<null>`null::float8`,
    })
    .from(shops)
    .where(inArray(shops.id, [...new Set(shopIds)]));
  return new Map(rows.map(({ shopId, ...rest }) => [shopId, rest]));
}

/** 범위 안 매물 수(매물 목록 제목, #215). 시간대는 1개씩 센다 */
export async function countListItems(db: DbReader, query: VisibleSlotQuery): Promise<number> {
  const [[row], windows] = await Promise.all([
    db
      .select({ total: count() })
      .from(slots)
      .innerJoin(shops, eq(shops.id, slots.shopId))
      .where(visibleSlotConditions(query)),
    visibleWindows(db, query),
  ]);
  return (row?.total ?? 0) + windows.length;
}

/** 지도 마커: 영역 안 샵별 매물 수(시간대는 1개씩 더한다). 가까운 순이 아니라 매물 많은 순으로 상한까지 */
export async function selectMapShops(db: DbReader, query: HomeSlotQuery): Promise<MapShop[]> {
  const slotCount = count();
  const [rows, windows] = await Promise.all([
    db
      .select({
        shopId: shops.id,
        name: shops.name,
        lat: sql<number>`ST_Y(${shops.location}::geometry)`.mapWith(Number),
        lng: sql<number>`ST_X(${shops.location}::geometry)`.mapWith(Number),
        slotCount,
        category: shops.category,
        sigunguCode: shops.sigunguCode,
      })
      .from(slots)
      .innerJoin(shops, eq(shops.id, slots.shopId))
      .where(visibleSlotConditions(query))
      .groupBy(shops.id)
      .orderBy(desc(slotCount), asc(shops.id))
      .limit(MAP_SHOP_LIMIT),
    visibleWindows(db, query),
  ]);
  // 업종은 DB 검사 조건(shops_category_check)으로 두 값만 들어 있다
  const slotShops = rows.map((row) => ({ ...row, category: row.category as MapShop['category'] }));
  // 시간대만 있는 샵도 구 단위 묶음(#204)에 들어가게 시·군·구를 같이 찾는다
  const places = await selectWindowShops(
    db,
    windows.map((window) => window.shopId),
    null,
  );
  const pins = windows.flatMap((window) => {
    const place = places.get(window.shopId);
    if (!place) return [];
    return [
      {
        shopId: window.shopId,
        shopName: window.shopName,
        lat: window.lat,
        lng: window.lng,
        category: window.category,
        sigunguCode: place.sigunguCode,
      },
    ];
  });
  return addWindowPins(slotShops, pins, MAP_SHOP_LIMIT);
}

export type SlotPageQuery = VisibleSlotQuery & {
  /** 거리순 기준점: 내 위치, 없으면 고른 동네 중심(D4) */
  origin: LatLng;
  sort: SlotSort;
  cursor: SlotCursor | null;
  /** 마커를 눌러 고른 샵. 없으면 영역 안 전체 */
  shopId: string | null;
};

/**
 * 목록 한 쪽(20개, D8). 매물 정렬은 DB에서 하고, 같은 정렬 값끼리는 매물 ID 순으로 순서를 정한다.
 * 범위 안 시간대(#308)는 같은 정렬 값으로 끼워 넣는다(merge.ts). 커서는 매물이든 시간대든 마지막 줄을 가리킨다
 */
export async function selectSlotPage(db: DbReader, query: SlotPageQuery): Promise<SlotListPage> {
  const distance = distanceFrom(query.origin);
  const { cursor } = query;

  // 정렬 순서와, 커서(마지막으로 본 줄) 다음부터 가져오는 조건. 같은 정렬 값끼리는 ID 오름차순
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

  const [rows, areaWindows] = await Promise.all([
    db
      .select(listColumns(distance))
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
      .limit(SLOT_PAGE_SIZE + 1),
    visibleWindows(db, query),
  ]);
  const windows = query.shopId
    ? areaWindows.filter((window) => window.shopId === query.shopId)
    : areaWindows;
  const windowItems = await toWindowItems(db, windows, query.origin, query.now);

  const page = mergePage<ListItem>({
    sort: query.sort,
    slots: rows.map((row) => ({ key: slotSortKey(query.sort, row), item: toListItem(row, query) })),
    windows: windowItems.map(({ item, card }) => ({
      key: windowSortKey(query.sort, item, card),
      item,
    })),
    cursor,
    size: SLOT_PAGE_SIZE,
  });
  return {
    items: page.items,
    nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
  };
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
  /** 기준점이 없으면(찜한 샵 매물, 위치를 아직 안 고름) null */
  distanceMeters: number | null;
  imagePath: string | null;
};

/** 목록 카드에 쓰는 칸(샵 대표 사진 하나 포함) */
function listColumns<Distance extends number | null>(distance: SQL<Distance>) {
  return {
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
  };
}

/** 배지는 서버 시각으로 정한다(공통 UI SlotCard 규칙, badges.ts) */
function toListItem(row: SlotRow, query: Pick<HomeSlotQuery, 'customerId' | 'now'>): SlotListItem {
  return {
    kind: 'slot',
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

/** 매물의 정렬 값(DB 정렬과 같은 값). 거리순에는 기준점이 늘 있어 거리가 있다 */
function slotSortKey(sort: SlotSort, row: SlotRow): SortKey {
  const value =
    sort === 'near'
      ? (row.distanceMeters ?? 0)
      : sort === 'discount'
        ? row.discountRate
        : row.startAt.getTime();
  return { value, id: row.slotId };
}

/** 시간대의 정렬 값: 샵 거리, 서비스 중 가장 큰 할인율, 가장 빠른 시작 시각 */
function windowSortKey(sort: SlotSort, item: WindowListItem, card: SlotWindowCard): SortKey {
  const value =
    sort === 'near'
      ? (item.distanceMeters ?? 0)
      : sort === 'discount'
        ? card.maxDiscountRate
        : new Date(card.earliestStartAt).getTime();
  return { value, id: card.windowId };
}

/** 시간대 카드 → 목록 한 줄. 거리는 매물과 같은 계산으로 DB에서 구한다(같은 샵 매물과 거리가 같다) */
async function toWindowItems(
  db: DbReader,
  cards: SlotWindowCard[],
  origin: LatLng | null,
  now: Date,
): Promise<{ item: WindowListItem; card: SlotWindowCard }[]> {
  const places = await selectWindowShops(
    db,
    cards.map((card) => card.shopId),
    origin,
  );
  return cards.flatMap((card) => {
    const place = places.get(card.shopId);
    if (!place) return [];
    const item: WindowListItem = {
      kind: 'window',
      windowId: card.windowId,
      shopId: card.shopId,
      shopName: card.shopName,
      firstMenuName: card.firstMenuName,
      menuCount: card.menuCount,
      startAt: card.startAt,
      endAt: card.endAt,
      maxDiscountRate: card.maxDiscountRate,
      minSalePrice: card.minSalePrice,
      imageUrl: card.imageUrl,
      distanceMeters: place.distanceMeters,
      badges: windowBadges(
        { earliestStartAt: new Date(card.earliestStartAt), newCustomerOnly: card.newCustomerOnly },
        now,
      ),
    };
    return [{ item, card }];
  });
}

/** 찜한 샵 매물 화면에 한 번에 보여주는 수 상한(찜한 샵의 지금 예약할 수 있는 매물이라 많지 않다). 시간대도 1개로 센다 */
export const FAVORITE_SLOT_LIMIT = 50;

/**
 * 찜한 샵의 지금 예약할 수 있는 매물(#215 2장, C-209). 목록·지도와 같은 조건(승인 샵·게시중·신규 고객 전용)이고 임박순이다.
 * 찜한 샵의 시간대(#308)도 가장 빠른 시작 순으로 섞는다. origin(내 위치·고른 동네)이 있으면 거리를 같이 준다
 */
export async function selectFavoriteSlots(
  db: DbReader,
  query: { customerId: string; now: Date; origin: LatLng | null },
): Promise<ListItem[]> {
  const visible: VisibleSlotQuery = {
    favoritesOf: query.customerId,
    filters: EMPTY_FILTERS,
    customerId: query.customerId,
    now: query.now,
  };
  const [rows, cards] = await Promise.all([
    db
      .select(listColumns(query.origin ? distanceFrom(query.origin) : sql<null>`null::float8`))
      .from(slots)
      .innerJoin(shops, eq(shops.id, slots.shopId))
      .where(visibleSlotConditions(visible))
      .orderBy(asc(slots.startAt), asc(slots.id))
      .limit(FAVORITE_SLOT_LIMIT),
    visibleWindows(db, visible),
  ]);
  const windowItems = await toWindowItems(db, cards, query.origin, query.now);
  return mergePage<ListItem>({
    sort: 'imminent',
    slots: rows.map((row) => ({ key: slotSortKey('imminent', row), item: toListItem(row, query) })),
    windows: windowItems.map(({ item, card }) => ({
      key: windowSortKey('imminent', item, card),
      item,
    })),
    cursor: null,
    size: FAVORITE_SLOT_LIMIT,
  }).items;
}
