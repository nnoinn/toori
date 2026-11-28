// 관심 매물(C-211) 저장·조회. 매물 상세의 [관심 매물]과 관심 화면 [매물 보기]가 같이 쓴다. 서버에서만 부른다.
// 표는 slot_interests(#616·#623). 이번에는 한 시술 매물만 다룬다(시간대 관심은 다음에 더한다).
// 본인 고객 계정의 관심만 다룬다(X-102). customerId는 requireCustomer()·ensureCustomerPage()에서 받은 값을 넘긴다.
// 🟡 목록: 볼 수 없게 된 매물(승인되지 않은 샵, 그 샵 이력이 있는 고객의 신규 고객 전용)은 뺀다.
//   마감된 매물(예약됨·마감·취소·완료, 시작 지남)은 흐리게 아래 '마감된 매물' 칸으로 옮긴다(docs/stage3-spec.md C-211)

import 'server-only';

import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import { shopImages, shops, slotInterests, slots } from '@/db/schema';
import { slotBadges } from '@/features/map/slot-list/badges';
import { shopImageUrl } from '@/features/map/slot-list/image-url';
import type { SlotListItem } from '@/features/map/slot-list/types';
import { getSlotStatus, type SlotStatus } from '@/features/slot-status/slot-status';
import { newCustomerOnlyVisible } from '@/server/customers';
import { categoryLabel } from '@/server/policy';
import { customerVisibleShop } from '@/server/shops/visibility';

type Db = Pick<ReturnType<typeof getDb>, 'select' | 'insert' | 'delete'>;

/** 관심 표시할 수 있는 매물: 승인 샵, 게시 전이 아님, 시간대 안에서 손님이 만든 매물이 아님(그 매물은 시간대 카드로만 보인다) */
function interestableSlot(slotId: string) {
  return and(
    eq(slots.id, slotId),
    customerVisibleShop(),
    isNull(slots.windowId),
    sql`not (${slots.status} = 'scheduled' and ${slots.publishAt} > now())`,
  );
}

/** 이 매물에 관심 표시했는지 */
export async function isSlotInterested(
  db: Db,
  customerId: string,
  slotId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: slotInterests.id })
    .from(slotInterests)
    .where(and(eq(slotInterests.customerId, customerId), eq(slotInterests.slotId, slotId)))
    .limit(1);
  return row !== undefined;
}

/** 관심 표시. 이미 했으면 그대로 둔다. 관심 표시할 수 없는 매물이면 저장하지 않고 false */
export async function addSlotInterest(
  db: Db,
  customerId: string,
  slotId: string,
): Promise<boolean> {
  const [slot] = await db
    .select({ id: slots.id })
    .from(slots)
    .innerJoin(shops, eq(shops.id, slots.shopId))
    .where(interestableSlot(slotId))
    .limit(1);
  if (!slot) return false;
  await db.insert(slotInterests).values({ customerId, slotId }).onConflictDoNothing();
  return true;
}

/** 관심 풀기. 하지 않았으면 아무것도 하지 않는다 */
export async function removeSlotInterest(
  db: Db,
  customerId: string,
  slotId: string,
): Promise<void> {
  await db
    .delete(slotInterests)
    .where(and(eq(slotInterests.customerId, customerId), eq(slotInterests.slotId, slotId)));
}

/** 관심 화면 [매물 보기]에 한 번에 보여 주는 수 상한(최근 관심 표시 순) */
export const INTEREST_SLOT_LIMIT = 50;

export type InterestedSlots = {
  /** 지금 예약할 수 있는 매물(게시중, 시작 전) */
  open: SlotListItem[];
  /** 마감된 매물(예약됨·마감·취소·완료, 시작 지남). 흐리게 보여 준다 */
  closed: SlotListItem[];
};

/** 관심 매물 목록. 최근에 관심 표시한 순이다 */
export async function selectInterestedSlots(
  db: Db,
  query: { customerId: string; now: Date },
): Promise<InterestedSlots> {
  const rows = await db
    .select({
      slotId: slots.id,
      status: slots.status,
      publishAt: slots.publishAt,
      startAt: slots.startAt,
      menuName: slots.menuName,
      listPrice: slots.listPrice,
      salePrice: slots.salePrice,
      discountRate: slots.discountRate,
      newCustomerOnly: slots.newCustomerOnly,
      holdCustomerId: slots.holdCustomerId,
      holdExpiresAt: slots.holdExpiresAt,
      shopId: shops.id,
      shopName: shops.name,
      category: shops.category,
      imagePath: sql<
        string | null
      >`(select ${shopImages.storagePath} from ${shopImages} where ${shopImages.shopId} = ${shops.id} and ${shopImages.kind} = 'main' order by ${shopImages.sortOrder} limit 1)`,
    })
    .from(slotInterests)
    .innerJoin(slots, eq(slots.id, slotInterests.slotId))
    .innerJoin(shops, eq(shops.id, slots.shopId))
    .where(
      and(
        eq(slotInterests.customerId, query.customerId),
        customerVisibleShop(),
        newCustomerOnlyVisible(query.customerId),
      ),
    )
    .orderBy(desc(slotInterests.createdAt), desc(slotInterests.id))
    .limit(INTEREST_SLOT_LIMIT);

  const result: InterestedSlots = { open: [], closed: [] };
  for (const row of rows) {
    // DB의 check 제약이 6가지 상태만 허용한다
    const status = getSlotStatus({ ...row, status: row.status as SlotStatus }, query.now);
    // 게시 전 매물은 관심 표시할 수 없지만, 혹시 있으면 보이지 않는다
    if (status === 'scheduled') continue;
    const open = status === 'published';
    const item: SlotListItem = {
      kind: 'slot',
      slotId: row.slotId,
      shopId: row.shopId,
      shopName: row.shopName,
      category: categoryLabel(row.category),
      menuName: row.menuName,
      startAt: row.startAt.toISOString(),
      listPrice: row.listPrice,
      salePrice: row.salePrice,
      discountRate: row.discountRate,
      imageUrl: shopImageUrl(row.imagePath),
      distanceMeters: null,
      badges: open ? slotBadges(row, query.customerId, query.now) : [],
    };
    (open ? result.open : result.closed).push(item);
  }
  return result;
}
