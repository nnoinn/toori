// 운영자 샵 상세의 '매물 관리' 칸(#373 ④, #567 3번) 읽기. 서버에서만 부른다.
// 새 매물 게시를 멈췄는지(시각·사유)와, 지금 올라와 있는 시간대 매물(게시예정·게시중, 끝나지 않음)·판매 전 한 시술 매물을
// 가까운 것부터 SHOP_SLOT_CONTROL_LIMIT개씩과 전체 수를 읽는다. 전체는 매물·예약 화면의 [시간대 매물]·[매물] 탭에서 본다

import 'server-only';

import { and, asc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import { shops, slots, slotWindows } from '@/db/schema';
import type { SlotStatus } from '@/db/schema/slots';
import { slotStatusIs } from '@/features/slot-status/slot-status-sql';
import { type PublishPauseCode, toAdminNoticeCode } from '@/server/policy/admin-notice';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

export type OpenWindowRow = {
  windowId: string;
  startAt: Date;
  endAt: Date;
  publishAt: Date;
};

/** 판매 전 한 시술 매물 한 줄. 상태·결제 중은 화면이 getSlotStatus·isSlotOnHold로 본다 */
export type OpenSlotRow = {
  slotId: string;
  menuName: string;
  startAt: Date;
  publishAt: Date;
  status: SlotStatus;
  holdCustomerId: string | null;
  holdExpiresAt: Date | null;
  /** 한 시술 매물이라 늘 null(강제 마감 단추 조건 canForceCloseSlot에 그대로 넘긴다) */
  windowId: null;
};

/** 영역마다 보여 주는 줄 수(#567 3번). 나머지는 [전체 보기]로 매물·예약 화면에서 본다 */
export const SHOP_SLOT_CONTROL_LIMIT = 5;

export type ShopSlotControl = {
  /** 새 매물 게시를 멈춘 시각, 운영자가 쓴 사유, 원장님에게 보여 줄 사유 코드(#489). 멈추지 않았으면 null */
  pause: { pausedAt: Date; reason: string; code: PublishPauseCode } | null;
  /** 지금 올라와 있는 시간대 매물(시작이 이른 것부터 SHOP_SLOT_CONTROL_LIMIT개까지). 운영자가 강제 마감할 수 있다 */
  openWindows: OpenWindowRow[];
  /** 지금 올라와 있는 시간대 매물 전체 수 */
  openWindowCount: number;
  /**
   * 판매 전(게시예정·게시중) 한 시술 매물(시작이 이른 것부터 SHOP_SLOT_CONTROL_LIMIT개까지). 재등록한 매물도 들어가고,
   * 시간대 안에서 손님이 만든 칸은 넣지 않는다. 손님이 결제 중인 매물도 보이고(강제 마감 단추는 없다)
   */
  openSlots: OpenSlotRow[];
  /** 판매 전 한 시술 매물 전체 수 */
  openSlotCount: number;
};

/** LIMIT 전에 센 전체 수 */
const totalCount = () => sql<number>`count(*) over ()`.mapWith(Number);

/** 샵의 매물 관리 칸. 없는 샵이면 null */
export async function selectShopSlotControl(
  db: DbReader,
  shopId: string,
  now: Date,
): Promise<ShopSlotControl | null> {
  const [shop] = await db
    .select({
      pausedAt: shops.publishPausedAt,
      reason: shops.publishPausedReason,
      code: shops.publishPausedCode,
    })
    .from(shops)
    .where(eq(shops.id, shopId));
  if (!shop) return null;
  const [windowRows, slotRows] = await Promise.all([
    db
      .select({
        windowId: slotWindows.id,
        startAt: slotWindows.startAt,
        endAt: slotWindows.endAt,
        publishAt: slotWindows.publishAt,
        total: totalCount(),
      })
      .from(slotWindows)
      .where(
        and(
          eq(slotWindows.shopId, shopId),
          inArray(slotWindows.status, ['scheduled', 'published']),
          gt(slotWindows.endAt, now),
        ),
      )
      .orderBy(asc(slotWindows.startAt), asc(slotWindows.id))
      .limit(SHOP_SLOT_CONTROL_LIMIT),
    db
      .select({
        slotId: slots.id,
        menuName: slots.menuName,
        startAt: slots.startAt,
        publishAt: slots.publishAt,
        status: slots.status,
        holdCustomerId: slots.holdCustomerId,
        holdExpiresAt: slots.holdExpiresAt,
        total: totalCount(),
      })
      .from(slots)
      .where(
        and(
          eq(slots.shopId, shopId),
          or(isNull(slots.windowId), eq(slots.shopId, shopId)),
          or(slotStatusIs('scheduled', now), slotStatusIs('published', now)),
        ),
      )
      .orderBy(asc(slots.startAt), asc(slots.id))
      .limit(SHOP_SLOT_CONTROL_LIMIT),
  ]);
  return {
    // 시각·사유·사유 코드는 같이 채우고 같이 비운다(shops_publish_pause_check)
    pause:
      shop.pausedAt && shop.reason
        ? {
            pausedAt: shop.pausedAt,
            reason: shop.reason,
            code: toAdminNoticeCode('publish_pause', shop.code),
          }
        : null,
    openWindows: windowRows.map((row) => ({
      windowId: row.windowId,
      startAt: row.startAt,
      endAt: row.endAt,
      publishAt: row.publishAt,
    })),
    openWindowCount: windowRows[0]?.total ?? 0,
    // DB의 check 제약이 6가지 상태만 허용한다
    openSlots: slotRows.map((row) => ({
      slotId: row.slotId,
      menuName: row.menuName,
      startAt: row.startAt,
      publishAt: row.publishAt,
      status: row.status as SlotStatus,
      holdCustomerId: row.holdCustomerId,
      holdExpiresAt: row.holdExpiresAt,
      windowId: null,
    })),
    openSlotCount: slotRows[0]?.total ?? 0,
  };
}
