// 영업시간을 바꿀 때 영업시간 밖이 되는 매물 읽기와 마감 (DB, 11/16 정민석). 서버에서만 부른다.
// 어떤 매물을 마감하고 어떤 매물을 그대로 두는지는 hours-change.ts가 정한다. 여기는 읽고, 고른 것을 마감한다.
// 마감은 대시보드 [마감]과 같은 함수를 쓴다: 매물은 closeSlotInDb(판매 전이고 결제 중이 아닐 때만 바뀌는 조건부 저장),
// 시간대는 closeWindow(결제가 끝난 예약은 그대로, 손님이 결제 중인 칸은 남김). 사유는 '기타'다

import 'server-only';

import { and, asc, eq, gt, inArray } from 'drizzle-orm';

import type { getDb } from '@/db';
import { slots, slotWindows, type SlotStatus } from '@/db/schema';
import { closeWindow, readWindowMenus } from '@/server/slot-windows/store';

import { closeSlotInDb } from '../../slots/slot-edit-store';
import type { HoursChangeImpact, HoursChangeSlot, HoursChangeWindow } from './hours-change';

type Db = Pick<ReturnType<typeof getDb>, 'select' | 'update'>;

/** 영업시간을 바꿔서 마감할 때 남기는 사유(11/16 정민석) */
export const HOURS_CHANGE_CLOSE_REASON = 'other' as const;

/** 살펴볼 매물: 아직 끝나지 않은 그 샵 매물 중 판매 전·예약됨(마감·취소·완료는 볼 필요가 없다) */
export async function selectHoursChangeCandidates(
  db: Pick<Db, 'select'>,
  shopId: string,
  now: Date,
): Promise<{ slots: HoursChangeSlot[]; windows: HoursChangeWindow[] }> {
  const [slotRows, windowRows] = await Promise.all([
    db
      .select({
        id: slots.id,
        status: slots.status,
        publishAt: slots.publishAt,
        startAt: slots.startAt,
        endAt: slots.endAt,
        menuName: slots.menuName,
        holdCustomerId: slots.holdCustomerId,
        holdExpiresAt: slots.holdExpiresAt,
        windowId: slots.windowId,
      })
      .from(slots)
      .where(
        and(
          eq(slots.shopId, shopId),
          gt(slots.endAt, now),
          inArray(slots.status, ['scheduled', 'published', 'reserved']),
        ),
      )
      .orderBy(asc(slots.startAt)),
    db
      .select({ id: slotWindows.id, startAt: slotWindows.startAt, endAt: slotWindows.endAt })
      .from(slotWindows)
      .where(
        and(
          eq(slotWindows.shopId, shopId),
          gt(slotWindows.endAt, now),
          inArray(slotWindows.status, ['scheduled', 'published']),
        ),
      )
      .orderBy(asc(slotWindows.startAt)),
  ]);
  const menusByWindow = await readWindowMenus(
    db,
    windowRows.map((row) => row.id),
  );
  return {
    // status는 DB 제약(slots_status_check)으로 상태 이름만 들어간다
    slots: slotRows.map((row) => ({ ...row, status: row.status as SlotStatus })),
    windows: windowRows.map((row) => ({
      ...row,
      menuNames: (menusByWindow.get(row.id) ?? []).map((menu) => menu.name),
    })),
  };
}

/**
 * 고른 매물과 시간대를 마감한다. 트랜잭션 안에서 부른다.
 * 그사이 손님이 결제를 시작했거나 예약된 매물은 조건부 저장에서 막혀 그대로 남고, 그 수를 돌려준다
 */
export async function closeForHoursChange(
  tx: Db,
  shopId: string,
  close: HoursChangeImpact['close'],
  now: Date,
): Promise<{ closedSlots: number; closedWindows: number; skipped: number }> {
  const result = { closedSlots: 0, closedWindows: 0, skipped: 0 };
  for (const row of close) {
    if (row.kind === 'slot') {
      const closed = await closeSlotInDb(tx, shopId, row.id, HOURS_CHANGE_CLOSE_REASON, now);
      if (closed.ok) result.closedSlots += 1;
      else result.skipped += 1;
    } else {
      const closed = await closeWindow(tx, {
        shopId,
        windowId: row.id,
        reason: HOURS_CHANGE_CLOSE_REASON,
        now,
      });
      if (closed.ok) result.closedWindows += 1;
      else result.skipped += 1;
    }
  }
  return result;
}
