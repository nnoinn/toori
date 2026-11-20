// 매물 등록 "지난 매물로 빠르게 올리기"(S-207) 조회. 서버에서만 부른다.
// 그 샵이 올린 한 시술 매물을 서비스(메뉴)·할인율·신규 고객 전용이 같은 것끼리 묶고, 가장 최근에 올린 묶음부터 준다.
// 상태와 상관없이 본다(마감·취소·완료 매물도 같은 구성으로 다시 올릴 수 있다).
// 손님이 시간대 안에서 만든 칸(windowId)은 원장님이 올린 매물이 아니라서 뺀다(ownerListedSlot과 같은 뜻)

import 'server-only';

import { and, desc, eq, isNull, max } from 'drizzle-orm';

import type { getDb } from '@/db';
import { slots } from '@/db/schema';

import type { SlotPresetRow } from './slot-presets';

/** 화면에서 숨긴 메뉴를 빼고도 몇 개 남게 넉넉히 읽는다 */
const PRESET_ROWS = 30;

export async function selectSlotPresetRows(
  db: Pick<ReturnType<typeof getDb>, 'select'>,
  shopId: string,
): Promise<SlotPresetRow[]> {
  const lastCreatedAt = max(slots.createdAt);
  return db
    .select({
      menuId: slots.menuId,
      discountRate: slots.discountRate,
      newCustomerOnly: slots.newCustomerOnly,
    })
    .from(slots)
    .where(and(eq(slots.shopId, shopId), isNull(slots.windowId)))
    .groupBy(slots.menuId, slots.discountRate, slots.newCustomerOnly)
    .orderBy(desc(lastCreatedAt))
    .limit(PRESET_ROWS);
}
