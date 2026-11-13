// 시간대 매물 DB 읽기·저장 (#308). 서버에서만 부른다.
// 원장님 등록·지난 설정·마감은 시간대 표를 읽고 쓴다(진짜 버전 ①). 고객 목록·상세는 시간대 표와 그 안의 매물을 읽는다(②).

import 'server-only';

import { and, asc, desc, eq, gt, inArray, isNull, lt, lte, not, type SQL, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import { menus, shopImages, shops, slots, slotWindowMenus, slotWindows } from '@/db/schema';
import type { BusinessHours } from '@/db/schema/shops';
import type { SlotCloseReason } from '@/db/schema/slots';
import { newCustomerOnlyVisible } from '@/server/customers';
import type { ServiceType, ShopCategory } from '@/server/policy';
import { customerVisibleShop } from '@/server/shops/visibility';

import { shopInArea, staleWindowHold, type WindowArea } from './conditions';
import type { ShopMenu, WindowDraft, WindowMenuDraft } from './rules';
import type { Range } from './starts';
import type { LastWindowSettings, SlotWindowShop } from './types';
import type { WindowMenuRow } from './view';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;
type DbWriter = Pick<ReturnType<typeof getDb>, 'insert'>;

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
 * 고객에게 시작 시각을 줄 때 이미 차 있는 시간: 그 샵들의 [from, to)와 겹치는 예약대기·게시중·예약됨 매물(샵별).
 * 단, 결제 없이 홀딩이 끝난 시간대 칸은 비어 있는 것으로 본다(staleWindowHold, 결제 대기 주문이 있으면 막는다, #308 ③)
 */
export async function readOccupiedRangesByShop(
  db: DbReader,
  input: { shopIds: readonly string[]; from: Date; to: Date; now: Date },
): Promise<Map<string, Range[]>> {
  const result = new Map<string, Range[]>();
  const shopIds = [...new Set(input.shopIds)];
  if (shopIds.length === 0) return result;
  const rows = await db
    .select({ shopId: slots.shopId, start: slots.startAt, end: slots.endAt })
    .from(slots)
    .where(
      and(
        inArray(slots.shopId, shopIds),
        inArray(slots.status, BLOCKING_SLOT_STATUSES),
        lt(slots.startAt, input.to),
        gt(slots.endAt, input.from),
        not(staleWindowHold(input.now)),
      ),
    );
  for (const { shopId, ...range } of rows) {
    result.set(shopId, [...(result.get(shopId) ?? []), range]);
  }
  return result;
}

/** 한 샵의 이미 차 있는 시간(readOccupiedRangesByShop과 같은 기준) */
export async function readOccupiedRanges(
  db: DbReader,
  input: { shopId: string; from: Date; to: Date; now: Date },
): Promise<Range[]> {
  const { shopId, ...rest } = input;
  return (await readOccupiedRangesByShop(db, { shopIds: [shopId], ...rest })).get(shopId) ?? [];
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

/**
 * 고객에게 보이는 시간대: 예약대기·게시중으로 저장했고 게시 시각이 지났고 아직 끝나지 않음, 승인된 샵,
 * 신규 고객 전용이면 그 샵에 이력이 없는 고객만(C-306·X-104, 로그인하지 않았으면 거르지 않는다).
 * 예약대기로 저장했어도 게시 시각이 지났으면 게시중으로 본다(windowStatus와 같다). shops와 조인한 쿼리에 넣는다
 */
function openWindowFor(customerId: string | null, now: Date): SQL {
  return and(
    inArray(slotWindows.status, ['scheduled', 'published']),
    lte(slotWindows.publishAt, now),
    gt(slotWindows.endAt, now),
    customerVisibleShop(),
    newCustomerOnlyVisible(customerId, {
      shopId: slotWindows.shopId,
      newCustomerOnly: slotWindows.newCustomerOnly,
    }),
  )!;
}

/** 고객에게 보이는 시간대 하나 */
export type OpenWindow = {
  windowId: string;
  shopId: string;
  startAt: Date;
  endAt: Date;
  newCustomerOnly: boolean;
};

/** 목록 카드에 쓰는 시간대와 샵 값 */
export type AreaWindow = OpenWindow & AreaShop;

/**
 * 범위 안의 고객에게 보이는 시간대(업종을 골랐으면 그 업종만). 시간대 시작 순으로 limit개까지.
 * 남은 시간에 들어가는 서비스가 있는지·필터는 부른 쪽이 계산한다(view.ts)
 */
export async function readAreaWindows(
  db: DbReader,
  input: {
    area: WindowArea;
    category: ShopCategory | null;
    customerId: string | null;
    now: Date;
    limit: number;
  },
): Promise<AreaWindow[]> {
  const rows = await db
    .select({
      windowId: slotWindows.id,
      startAt: slotWindows.startAt,
      endAt: slotWindows.endAt,
      newCustomerOnly: slotWindows.newCustomerOnly,
      shopId: shops.id,
      name: shops.name,
      category: shops.category,
      lat: sql<number>`ST_Y(${shops.location}::geometry)`.mapWith(Number),
      lng: sql<number>`ST_X(${shops.location}::geometry)`.mapWith(Number),
      imagePath: sql<
        string | null
      >`(select ${shopImages.storagePath} from ${shopImages} where ${shopImages.shopId} = ${shops.id} and ${shopImages.kind} = 'main' order by ${shopImages.sortOrder} limit 1)`,
    })
    .from(slotWindows)
    .innerJoin(shops, eq(shops.id, slotWindows.shopId))
    .where(
      and(
        openWindowFor(input.customerId, input.now),
        shopInArea(input.area),
        input.category ? eq(shops.category, input.category) : undefined,
      ),
    )
    .orderBy(asc(slotWindows.startAt), asc(slotWindows.id))
    .limit(input.limit);
  // DB의 check 제약이 정해진 업종만 허용한다
  return rows.map((row) => ({ ...row, category: row.category as ShopCategory }));
}

/** 고객에게 보이는 시간대 하나(openWindowFor와 같은 기준). 없거나 볼 수 없으면 null */
export async function readOpenWindow(
  db: DbReader,
  input: { windowId: string; customerId: string | null; now: Date },
): Promise<OpenWindow | null> {
  const [row] = await db
    .select({
      windowId: slotWindows.id,
      shopId: slotWindows.shopId,
      startAt: slotWindows.startAt,
      endAt: slotWindows.endAt,
      newCustomerOnly: slotWindows.newCustomerOnly,
    })
    .from(slotWindows)
    .innerJoin(shops, eq(shops.id, slotWindows.shopId))
    .where(and(eq(slotWindows.id, input.windowId), openWindowFor(input.customerId, input.now)));
  return row ?? null;
}

/** 시간대마다 올린 서비스(올릴 때 값). 샵의 메뉴 순서대로 */
export async function readWindowMenus(
  db: DbReader,
  windowIds: readonly string[],
): Promise<Map<string, WindowMenuRow[]>> {
  const result = new Map<string, WindowMenuRow[]>();
  if (windowIds.length === 0) return result;
  const rows = await db
    .select({
      windowId: slotWindowMenus.windowId,
      menuId: slotWindowMenus.menuId,
      serviceType: slotWindowMenus.serviceType,
      name: slotWindowMenus.menuName,
      description: slotWindowMenus.menuDescription,
      durationMinutes: slotWindowMenus.durationMinutes,
      listPrice: slotWindowMenus.listPrice,
      discountRate: slotWindowMenus.discountRate,
      salePrice: slotWindowMenus.salePrice,
    })
    .from(slotWindowMenus)
    .innerJoin(menus, eq(menus.id, slotWindowMenus.menuId))
    .where(inArray(slotWindowMenus.windowId, [...new Set(windowIds)]))
    .orderBy(asc(menus.sortOrder), asc(slotWindowMenus.menuName));
  for (const { windowId, ...menu } of rows) {
    // DB의 check 제약이 정해진 서비스 종류만 허용한다
    const row = { ...menu, serviceType: menu.serviceType as ServiceType };
    result.set(windowId, [...(result.get(windowId) ?? []), row]);
  }
  return result;
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

/** 저장한 시간대 하나 */
export type SavedWindow = {
  id: string;
  startAt: Date;
  endAt: Date;
  publishAt: Date;
  status: 'scheduled' | 'published';
};

/**
 * 원장님이 켠 묶음마다 시간대 한 줄과, 각 시간대에 올린 서비스(올릴 때 이름·정가·소요 시간·할인가)를 저장한다.
 * 트랜잭션 안에서 부른다(하나라도 실패하면 아무것도 저장하지 않는다). 시작 순으로 돌려준다.
 * 같은 샵의 시간대·매물과 겹치면 DB가 slot_windows_no_overlap으로 막는다(#319 제약·트리거, createSlotWindows가 WINDOW_OVERLAP으로 바꾼다)
 */
export async function insertSlotWindows(
  tx: DbWriter,
  input: {
    shopId: string;
    createdBy: string;
    newCustomerOnly: boolean;
    windows: readonly WindowDraft[];
    menus: readonly WindowMenuDraft[];
  },
): Promise<SavedWindow[]> {
  const saved = await tx
    .insert(slotWindows)
    .values(
      input.windows.map((window) => ({
        shopId: input.shopId,
        startAt: window.start,
        endAt: window.end,
        publishAt: window.publishAt,
        status: window.status,
        newCustomerOnly: input.newCustomerOnly,
        createdBy: input.createdBy,
      })),
    )
    .returning({
      id: slotWindows.id,
      startAt: slotWindows.startAt,
      endAt: slotWindows.endAt,
      publishAt: slotWindows.publishAt,
      status: slotWindows.status,
    });
  await tx
    .insert(slotWindowMenus)
    .values(
      saved.flatMap((window) => input.menus.map((menu) => ({ windowId: window.id, ...menu }))),
    );
  return saved
    .map((window) => ({ ...window, status: window.status as SavedWindow['status'] }))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

/**
 * 그 샵이 마지막으로 올린 시간대의 서비스·할인율과 신규 고객 전용 여부. 지금 숨긴 메뉴는 빼고 메뉴 순서대로 준다.
 * 올린 적 없거나 남은 서비스가 없으면 null(원장님 ① 화면이 채워 둘 것이 없다)
 */
export async function readLastWindowSettings(
  db: DbReader,
  shopId: string,
): Promise<LastWindowSettings | null> {
  const [last] = await db
    .select({ id: slotWindows.id, newCustomerOnly: slotWindows.newCustomerOnly })
    .from(slotWindows)
    .where(eq(slotWindows.shopId, shopId))
    // 한 번에 올린 시간대들은 저장 시각이 같다. 그중 가장 늦은 시간대를 고른다(서비스·할인율은 모두 같다)
    .orderBy(desc(slotWindows.createdAt), desc(slotWindows.startAt))
    .limit(1);
  if (!last) return null;
  const rows = await db
    .select({ menuId: slotWindowMenus.menuId, discountRate: slotWindowMenus.discountRate })
    .from(slotWindowMenus)
    .innerJoin(menus, eq(menus.id, slotWindowMenus.menuId))
    .where(and(eq(slotWindowMenus.windowId, last.id), isNull(menus.hiddenAt)))
    .orderBy(asc(menus.sortOrder));
  if (rows.length === 0) return null;
  return { menus: rows, newCustomerOnly: last.newCustomerOnly };
}

/**
 * 내 샵의 예약대기·게시중이고 아직 끝나지 않은 시간대를 마감한다(사유·시각 기록). 안에서 결제가 끝난 예약과 결제 중인 칸은 그대로다.
 * 없거나 남의 시간대면 WINDOW_NOT_FOUND, 이미 마감했거나 시간이 지났으면 WINDOW_CLOSED
 */
export async function closeWindow(
  db: Pick<ReturnType<typeof getDb>, 'select' | 'update'>,
  input: { shopId: string; windowId: string; reason: SlotCloseReason; now: Date },
): Promise<
  { ok: true; closedAt: Date } | { ok: false; code: 'WINDOW_NOT_FOUND' | 'WINDOW_CLOSED' }
> {
  const [closed] = await db
    .update(slotWindows)
    .set({ status: 'closed', closeReason: input.reason, closedAt: input.now })
    .where(
      and(
        eq(slotWindows.id, input.windowId),
        eq(slotWindows.shopId, input.shopId),
        inArray(slotWindows.status, ['scheduled', 'published']),
        gt(slotWindows.endAt, input.now),
      ),
    )
    .returning({ closedAt: slotWindows.closedAt });
  if (closed?.closedAt) return { ok: true, closedAt: closed.closedAt };
  const [found] = await db
    .select({ id: slotWindows.id })
    .from(slotWindows)
    .where(and(eq(slotWindows.id, input.windowId), eq(slotWindows.shopId, input.shopId)));
  return { ok: false, code: found ? 'WINDOW_CLOSED' : 'WINDOW_NOT_FOUND' };
}
