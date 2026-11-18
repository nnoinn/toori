// 운영자 매물 관리(#373 ④, #433)의 DB 저장. 서버에서만 부른다. 순서와 권한은 admin.ts.
// 모두 트랜잭션 안에서 부르고, 처리 기록(shop.publish_pause·shop.publish_resume·slot.force_close)을 같은 트랜잭션에 남긴다.
// 바꾸는 조건을 저장 문장에 넣어서, 운영자 둘이 동시에 하거나 손님이 그 순간 [예약하기]를 눌러도 DB에서 한쪽만 된다(원장님 마감과 같다)

import 'server-only';

import { and, eq, isNotNull, isNull, not, or, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import { shops, slots, slotWindows } from '@/db/schema';
import { slotIsOnHold, slotStatusIs } from '@/features/slot-status/slot-status-sql';
import { ok, type Result } from '@/lib/result';
import { recordAdminAction } from '@/server/admin/action-store';
import { closeWindow, type KeptSlotRow } from '@/server/slot-windows/store';

import { adminSlotFail } from './admin-errors';

/** 트랜잭션(getDb().transaction의 tx) */
export type AdminSlotTx = Pick<ReturnType<typeof getDb>, 'select' | 'insert' | 'update'>;

type AdminInput = { adminId: string; reason: string; now: Date };

async function shopExists(tx: AdminSlotTx, shopId: string): Promise<boolean> {
  const [row] = await tx.select({ id: shops.id }).from(shops).where(eq(shops.id, shopId));
  return row !== undefined;
}

/**
 * 샵의 새 매물 게시를 멈춘다(시각·사유). 이미 올린 매물과 예약은 그대로다(11/15 nnoinn 결정 3).
 * 이미 멈췄으면 ALREADY_PAUSED, 없는 샵이면 SHOP_NOT_FOUND
 */
export async function pausePublishingInTx(
  tx: AdminSlotTx,
  input: AdminInput & { shopId: string },
): Promise<Result<{ shopId: string; pausedAt: Date }>> {
  const [row] = await tx
    .update(shops)
    .set({ publishPausedAt: input.now, publishPausedReason: input.reason })
    .where(and(eq(shops.id, input.shopId), isNull(shops.publishPausedAt)))
    .returning({ id: shops.id });
  if (!row) {
    return adminSlotFail(
      (await shopExists(tx, input.shopId)) ? 'ALREADY_PAUSED' : 'SHOP_NOT_FOUND',
    );
  }
  await recordAdminAction(tx, {
    adminId: input.adminId,
    action: 'shop.publish_pause',
    targetType: 'shop',
    targetId: input.shopId,
    memo: input.reason,
  });
  return ok({ shopId: input.shopId, pausedAt: input.now });
}

/** 멈춘 게시를 다시 연다. 멈추지 않았으면 NOT_PAUSED, 없는 샵이면 SHOP_NOT_FOUND. 메모는 처리 기록에 남긴다 */
export async function resumePublishingInTx(
  tx: AdminSlotTx,
  input: AdminInput & { shopId: string },
): Promise<Result<{ shopId: string; resumedAt: Date }>> {
  const [row] = await tx
    .update(shops)
    .set({ publishPausedAt: null, publishPausedReason: null })
    .where(and(eq(shops.id, input.shopId), isNotNull(shops.publishPausedAt)))
    .returning({ id: shops.id });
  if (!row) {
    return adminSlotFail((await shopExists(tx, input.shopId)) ? 'NOT_PAUSED' : 'SHOP_NOT_FOUND');
  }
  await recordAdminAction(tx, {
    adminId: input.adminId,
    action: 'shop.publish_resume',
    targetType: 'shop',
    targetId: input.shopId,
    memo: input.reason,
  });
  return ok({ shopId: input.shopId, resumedAt: input.now });
}

/**
 * 판매 전(게시예정·게시중) 매물을 운영자 마감(close_reason admin)으로 닫는다. 손님이 결제 중(10분 홀딩)이면 SLOT_ON_HOLD(#433).
 * 시간대 안에서 손님이 만든 칸은 WINDOW_SLOT(그 시간대를 마감한다). 예약됨·마감·취소·완료면 SLOT_NOT_OPEN
 */
export async function forceCloseSlotInTx(
  tx: AdminSlotTx,
  input: AdminInput & { slotId: string },
): Promise<Result<{ slotId: string; closedAt: Date }>> {
  const { now } = input;
  const [row] = await tx
    .update(slots)
    .set({ status: 'closed', closedAt: now, closeReason: 'admin' })
    .where(
      and(
        eq(slots.id, input.slotId),
        isNull(slots.windowId),
        or(slotStatusIs('scheduled', now), slotStatusIs('published', now)),
        not(slotIsOnHold(now)),
      ),
    )
    .returning({ id: slots.id });
  if (!row) return adminSlotFail(await slotCloseProblem(tx, input.slotId, now));
  await recordAdminAction(tx, {
    adminId: input.adminId,
    action: 'slot.force_close',
    targetType: 'slot',
    targetId: input.slotId,
    memo: input.reason,
  });
  return ok({ slotId: input.slotId, closedAt: now });
}

/** 마감하지 못한 이유(조건부 저장이 막힌 뒤 다시 읽는다) */
async function slotCloseProblem(tx: AdminSlotTx, slotId: string, now: Date) {
  const [found] = await tx
    .select({
      windowId: slots.windowId,
      open: sql<boolean>`${or(slotStatusIs('scheduled', now), slotStatusIs('published', now))}`,
      onHold: sql<boolean>`${slotIsOnHold(now)}`,
    })
    .from(slots)
    .where(eq(slots.id, slotId));
  if (!found) return 'SLOT_NOT_FOUND' as const;
  if (found.windowId) return 'WINDOW_SLOT' as const;
  if (!found.open) return 'SLOT_NOT_OPEN' as const;
  return found.onHold ? ('SLOT_ON_HOLD' as const) : ('SLOT_NOT_OPEN' as const);
}

/**
 * 게시예정·게시중이고 끝나지 않은 시간대를 운영자 마감으로 닫는다. 원장님 시간대 마감(closeWindow, #308 ③-2)과 같아서,
 * 결제가 끝난 예약은 그대로이고 손님이 결제 중인 칸은 남겨서 돌려준다. 없으면 WINDOW_NOT_FOUND, 이미 마감·지남이면 WINDOW_CLOSED
 */
export async function forceCloseWindowInTx(
  tx: AdminSlotTx,
  input: AdminInput & { windowId: string },
): Promise<Result<{ windowId: string; closedAt: Date; keptSlots: KeptSlotRow[] }>> {
  const [window] = await tx
    .select({ shopId: slotWindows.shopId })
    .from(slotWindows)
    .where(eq(slotWindows.id, input.windowId));
  if (!window) return adminSlotFail('WINDOW_NOT_FOUND');
  const closed = await closeWindow(tx, {
    shopId: window.shopId,
    windowId: input.windowId,
    reason: 'admin',
    now: input.now,
  });
  if (!closed.ok) return adminSlotFail(closed.code);
  await recordAdminAction(tx, {
    adminId: input.adminId,
    action: 'slot.force_close',
    targetType: 'slot_window',
    targetId: input.windowId,
    memo: input.reason,
  });
  return ok({ windowId: input.windowId, closedAt: closed.closedAt, keptSlots: closed.keptSlots });
}
