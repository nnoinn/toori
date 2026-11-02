// 취소 시간대 재등록 조회·저장 (DB, O13, S-408·S-208). 서버에서만 부른다. 권한·입점 승인은 부른 쪽이 먼저 확인한다.
// 저장은 매물 등록(createSlotInDb)을 그대로 다시 써서 등록과 같은 확인(메뉴·시작 시각 단위·48시간·영업시간·시간 겹침)을 거친다.
// 메뉴 값(정가·소요 시간 등)은 지금 메뉴에서 다시 복사하고, 할인율·신규 고객 전용은 원래 매물 값을 쓴다.
// 같은 취소 매물로 두 번 재등록하지 못한다. 거의 동시에 두 번 눌러도 시간 겹침 제약(slots_no_overlap)이 하나만 남긴다.

import 'server-only';

import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';

import { getDb } from '@/db';
import { slots, type SlotStatus } from '@/db/schema';
import { fail, type Result } from '@/lib/result';
import type { DiscountRate } from '@/server/policy';

import { type CreatedSlot, createSlotInDb } from './new/slot-create-store';
import { RELIST_MESSAGES, relistDraftMessage, relistProblem } from './relist';

type Db = Pick<ReturnType<typeof getDb>, 'select' | 'transaction'>;

/** 재등록 화면과 확인에 쓰는 원래(취소된) 매물 값 */
export type SlotForRelist = {
  id: string;
  menuId: string;
  menuName: string;
  status: SlotStatus;
  startAt: Date;
  endAt: Date;
  /** 원래 매물에 복사해 둔 정가(지금 메뉴 정가와 다르면 화면에 알려 준다) */
  listPrice: number;
  discountRate: DiscountRate;
  newCustomerOnly: boolean;
  /** 이 매물로 재등록한 새 매물. 없으면 null */
  relistedSlotId: string | null;
};

const slotIdSchema = z.uuid();

/** 그 샵의 매물 한 건과, 그 매물로 재등록한 새 매물. 다른 샵 매물이거나 id 모양이 아니면 null */
export async function selectSlotForRelist(
  db: Pick<Db, 'select'>,
  shopId: string,
  slotId: string,
): Promise<SlotForRelist | null> {
  if (!slotIdSchema.safeParse(slotId).success) return null;
  const relisted = alias(slots, 'relisted');
  const [row] = await db
    .select({
      id: slots.id,
      menuId: slots.menuId,
      menuName: slots.menuName,
      status: slots.status,
      startAt: slots.startAt,
      endAt: slots.endAt,
      listPrice: slots.listPrice,
      discountRate: slots.discountRate,
      newCustomerOnly: slots.newCustomerOnly,
      relistedSlotId: relisted.id,
    })
    .from(slots)
    .leftJoin(relisted, eq(relisted.relistedFromSlotId, slots.id))
    .where(and(eq(slots.id, slotId), eq(slots.shopId, shopId)))
    .limit(1);
  if (!row) return null;
  // status는 DB 제약(slots_status_check), 할인율은 저장할 때 선택지만 받는다
  return {
    ...row,
    status: row.status as SlotStatus,
    discountRate: row.discountRate as DiscountRate,
  };
}

/** 원래 매물과 같은 조건으로 등록 화면에 넣었을 값(등록 확인 validateSlotDraft·createSlotInDb 입력) */
export function relistInput(slot: SlotForRelist) {
  return {
    menuId: slot.menuId,
    startAt: slot.startAt.toISOString(),
    discountRate: slot.discountRate,
    newCustomerOnly: slot.newCustomerOnly,
  };
}

/** 취소된 매물을 같은 조건의 새 매물로 바로 게시한다. 원래 매물은 '취소'로 남기고 새 매물에 원래 매물을 적는다 */
export async function relistSlotInDb(
  db: Db,
  shopId: string,
  createdBy: string,
  slotId: string,
  now: Date,
): Promise<Result<CreatedSlot>> {
  const slot = await selectSlotForRelist(db, shopId, slotId);
  if (!slot) return fail('SLOT_NOT_FOUND', RELIST_MESSAGES.SLOT_NOT_FOUND);
  const problem = relistProblem(slot, now);
  if (problem) return fail(problem, RELIST_MESSAGES[problem]);

  const created = await createSlotInDb(db, shopId, createdBy, relistInput(slot), now, {
    relistedFromSlotId: slot.id,
  });
  if (created.ok) return created;
  return fail(created.error.code, relistDraftMessage(created.error.code, created.error.message));
}
