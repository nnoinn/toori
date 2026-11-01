// 업종 변경 때 매물 마감·메뉴 숨김 (DB, O2). 서버에서만 부른다.
// 정민석 결정(10/28): 업종을 바꾸면 판매 전 매물(예약대기·게시중)을 모두 마감(사유 '기타')하고 메뉴를 모두 숨긴다.
// 원장님이 새 업종에 맞게 메뉴·매물을 다시 만든다. 예약된 매물은 그대로 진행한다(S-206: 예약된 매물은 마감할 수 없다).
// 다른 고객이 결제 중(홀딩)인 매물이 있으면 결제와 부딪히지 않게 업종 변경을 막는다.

import 'server-only';

import { and, count, eq, isNull, not, or, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import { menus, slots } from '@/db/schema';
import { slotIsOnHold, slotStatusIs } from '@/features/slot-status/slot-status-sql';

type Db = Pick<ReturnType<typeof getDb>, 'select' | 'update'>;

/** 업종을 바꾸면 영향을 받는 것 */
export type CategoryChangeImpact = {
  /** 마감될 판매 전 매물(예약대기·게시중) 수 */
  openSlots: number;
  /** 그중 다른 고객이 결제 중인 매물 수. 1 이상이면 업종을 바꿀 수 없다 */
  heldSlots: number;
  /** 숨겨질 메뉴 수 */
  visibleMenus: number;
};

/** 지금 화면 상태가 예약대기·게시중인 그 샵 매물 */
const openSlotsOf = (shopId: string, now: Date) =>
  and(eq(slots.shopId, shopId), or(slotStatusIs('scheduled', now), slotStatusIs('published', now)));

export async function selectCategoryChangeImpact(
  db: Pick<Db, 'select'>,
  shopId: string,
  now: Date,
): Promise<CategoryChangeImpact> {
  const [slotCounts] = await db
    .select({
      openSlots: count(),
      heldSlots: sql<number>`count(*) filter (where ${slotIsOnHold(now)})`.mapWith(Number),
    })
    .from(slots)
    .where(openSlotsOf(shopId, now));
  const [menuCount] = await db
    .select({ visibleMenus: count() })
    .from(menus)
    .where(and(eq(menus.shopId, shopId), isNull(menus.hiddenAt)));
  return { ...slotCounts, visibleMenus: menuCount.visibleMenus };
}

/**
 * 판매 전 매물을 마감하고 메뉴를 숨긴다. 트랜잭션 안에서 부른다.
 * 홀딩 중인 매물이 있으면 아무것도 바꾸지 않고 false(부른 쪽이 트랜잭션을 되돌린다)
 */
export async function closeSlotsAndHideMenus(
  tx: Db,
  shopId: string,
  now: Date,
): Promise<{ ok: true; closedSlots: number; hiddenMenus: number } | { ok: false }> {
  // 홀딩 중이 아닌 것만 마감한다. 고객이 홀딩한 매물은 결제 처리(강규민)가 먼저다
  const closed = await tx
    .update(slots)
    .set({ status: 'closed', closedAt: now, closeReason: 'other' })
    .where(and(openSlotsOf(shopId, now), not(slotIsOnHold(now))))
    .returning({ id: slots.id });

  // 마감하는 사이 다른 고객이 홀딩했으면 판매 전 매물이 남는다. 그러면 업종을 바꾸지 않는다
  const [left] = await tx.select({ n: count() }).from(slots).where(openSlotsOf(shopId, now));
  if (left.n > 0) return { ok: false };

  const hidden = await tx
    .update(menus)
    .set({ hiddenAt: now })
    .where(and(eq(menus.shopId, shopId), isNull(menus.hiddenAt)))
    .returning({ id: menus.id });

  return { ok: true, closedSlots: closed.length, hiddenMenus: hidden.length };
}
