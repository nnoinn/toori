// 업종 변경 때 확인과 메뉴 초기화 (DB, O2). 서버에서만 부른다.
// 10/29 nnoinn 결정(기술 가이드 7장 "원장님 업종 변경", #143): 예약대기·게시중·예약됨(서비스 시작 전) 매물이 하나라도 있으면
// 업종을 바꿀 수 없다. 매물은 자동으로 마감하지 않고 원장님이 직접 마감하거나 이용이 끝난 뒤 바꾼다. 바꾸면 메뉴를 초기화한다.
// 메뉴 초기화: 지난 매물이 메뉴를 가리키고 있어서 지우지 않고 숨긴다. 메뉴 화면은 지금 업종의 서비스 종류인 메뉴만
// 보여주므로(settings/menu/page.tsx) 예전 업종 메뉴는 목록과 '숨긴 메뉴'에 더 이상 나오지 않는다.

import 'server-only';

import { and, count, eq, gt, inArray, isNull, or } from 'drizzle-orm';

import { getDb } from '@/db';
import { menus, slots } from '@/db/schema';
import { slotStatusIs } from '@/features/slot-status/slot-status-sql';
import type { ShopCategory } from '@/server/policy/catalog';

import { serviceTypesOf } from '../menu/menu';

type Db = Pick<ReturnType<typeof getDb>, 'select' | 'update'>;

/** 업종을 바꾸면 영향을 받는 것 */
export type CategoryChangeImpact = {
  /** 업종 변경을 막는 매물(예약대기·게시중·예약됨, 서비스 시작 전) 수. 1 이상이면 바꿀 수 없다 */
  activeSlots: number;
  /** 초기화돼서 메뉴 화면에서 빠지는 메뉴(지금 업종의 메뉴, 숨긴 것 포함) 수 */
  menus: number;
};

/** 업종 변경을 막는 그 샵 매물: 지금 화면 상태가 예약대기·게시중이거나, 예약됐고 아직 시작 전 */
const activeSlotsOf = (shopId: string, now: Date) =>
  and(
    eq(slots.shopId, shopId),
    or(
      slotStatusIs('scheduled', now),
      slotStatusIs('published', now),
      and(eq(slots.status, 'reserved'), gt(slots.startAt, now)),
    ),
  );

async function countActiveSlots(db: Pick<Db, 'select'>, shopId: string, now: Date) {
  const [row] = await db.select({ n: count() }).from(slots).where(activeSlotsOf(shopId, now));
  return row.n;
}

/** 그 업종의 서비스 종류인 그 샵 메뉴 */
const menusOfCategory = (shopId: string, category: ShopCategory) =>
  and(
    eq(menus.shopId, shopId),
    inArray(
      menus.serviceType,
      serviceTypesOf(category).map((type) => type.key),
    ),
  );

export async function selectCategoryChangeImpact(
  db: Pick<Db, 'select'>,
  shopId: string,
  currentCategory: ShopCategory,
  now: Date,
): Promise<CategoryChangeImpact> {
  const [activeSlots, [menuCount]] = await Promise.all([
    countActiveSlots(db, shopId, now),
    db.select({ n: count() }).from(menus).where(menusOfCategory(shopId, currentCategory)),
  ]);
  return { activeSlots, menus: menuCount.n };
}

/**
 * 업종을 바꾸기 전에 메뉴를 초기화한다(모두 숨김). 트랜잭션 안에서 부른다.
 * 그사이 막는 매물이 생겼으면 아무것도 바꾸지 않고 false(부른 쪽이 업종을 바꾸지 않는다)
 */
export async function resetMenusForCategoryChange(
  tx: Db,
  shopId: string,
  currentCategory: ShopCategory,
  now: Date,
): Promise<{ ok: true; resetMenus: number } | { ok: false }> {
  if ((await countActiveSlots(tx, shopId, now)) > 0) return { ok: false };

  const [menuCount] = await tx
    .select({ n: count() })
    .from(menus)
    .where(menusOfCategory(shopId, currentCategory));
  await tx
    .update(menus)
    .set({ hiddenAt: now })
    .where(and(eq(menus.shopId, shopId), isNull(menus.hiddenAt)));
  return { ok: true, resetMenus: menuCount.n };
}
