// 운영자 샵 상세의 '매물 관리' 칸(#373 ④) 읽기. 서버에서만 부른다.
// 새 매물 게시를 멈췄는지(시각·사유)와 지금 올라와 있는 시간대 매물(게시예정·게시중, 끝나지 않음)을 읽는다

import 'server-only';

import { and, asc, eq, gt, inArray } from 'drizzle-orm';

import type { getDb } from '@/db';
import { shops, slotWindows } from '@/db/schema';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

export type OpenWindowRow = {
  windowId: string;
  startAt: Date;
  endAt: Date;
  publishAt: Date;
};

export type ShopSlotControl = {
  /** 새 매물 게시를 멈춘 시각과 사유. 멈추지 않았으면 null */
  pause: { pausedAt: Date; reason: string } | null;
  /** 지금 올라와 있는 시간대 매물(시작이 이른 것부터). 운영자가 강제 마감할 수 있다 */
  openWindows: OpenWindowRow[];
};

/** 샵의 매물 관리 칸. 없는 샵이면 null */
export async function selectShopSlotControl(
  db: DbReader,
  shopId: string,
  now: Date,
): Promise<ShopSlotControl | null> {
  const [shop] = await db
    .select({ pausedAt: shops.publishPausedAt, reason: shops.publishPausedReason })
    .from(shops)
    .where(eq(shops.id, shopId));
  if (!shop) return null;
  const openWindows = await db
    .select({
      windowId: slotWindows.id,
      startAt: slotWindows.startAt,
      endAt: slotWindows.endAt,
      publishAt: slotWindows.publishAt,
    })
    .from(slotWindows)
    .where(
      and(
        eq(slotWindows.shopId, shopId),
        inArray(slotWindows.status, ['scheduled', 'published']),
        gt(slotWindows.endAt, now),
      ),
    )
    .orderBy(asc(slotWindows.startAt));
  return {
    // 시각과 사유는 같이 채우고 같이 비운다(shops_publish_pause_check)
    pause: shop.pausedAt && shop.reason ? { pausedAt: shop.pausedAt, reason: shop.reason } : null,
    openWindows,
  };
}
