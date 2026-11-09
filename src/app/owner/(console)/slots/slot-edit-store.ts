// 매물 수정·마감 저장 (DB, O10, S-206·S-209). 서버에서만 부른다. 권한·입점 승인은 부른 쪽이 먼저 확인한다.
// 저장 문장에 "그 샵 매물이고, 지금 판매 전이고, 홀딩 중이 아님" 조건을 같이 넣는다(#57).
// 원장님이 저장하는 순간 고객이 예약하기를 눌러도 DB에서 한쪽만 된다. 막히면 매물을 다시 읽어 이유를 알려준다.

import 'server-only';

import { and, eq, not, or, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@/db';
import { slots, type SlotStatus } from '@/db/schema';
import { getSlotStatus } from '@/features/slot-status/slot-status';
import { slotIsOnHold, slotStatusIs } from '@/features/slot-status/slot-status-sql';
import { fail, ok, type Result } from '@/lib/result';
import type { DiscountRate } from '@/server/policy';

import type { SavedSlot } from './slot-create-store';
import { validateSlotDraft } from './slot-draft-store';
import { SLOT_CLOSE_REASON_OPTIONS, SLOT_EDIT_MESSAGES, slotEditProblem } from './slot-edit';
import { parseSlotPricing, SLOT_PRICING_ERROR } from './slot-pricing';
import { overlapFailure, slotValuesFrom } from './slot-save';

type Db = ReturnType<typeof getDb>;

/** 수정 화면과 이유 확인에 쓰는 매물 값 */
export type SlotForEdit = {
  id: string;
  menuId: string;
  menuName: string;
  status: SlotStatus;
  startAt: Date;
  endAt: Date;
  publishAt: Date;
  discountRate: DiscountRate;
  newCustomerOnly: boolean;
  holdCustomerId: string | null;
  holdExpiresAt: Date | null;
};

const slotIdSchema = z.uuid();
const closeReasonSchema = z.enum(SLOT_CLOSE_REASON_OPTIONS);

/** 지금 판매 전(예약대기·게시중)이고 홀딩 중이 아닌 매물만. slot-edit.ts slotEditProblem과 같은 답 */
function editableNow(now: Date): SQL {
  return and(
    or(slotStatusIs('scheduled', now), slotStatusIs('published', now)),
    not(slotIsOnHold(now)),
  )!;
}

/** 막힌 이유(코드)를 원장님에게 보여줄 문구와 함께 돌려준다 */
function failWith(problem: keyof typeof SLOT_EDIT_MESSAGES): Result<never> {
  return fail(problem, SLOT_EDIT_MESSAGES[problem]);
}

/** 그 샵의 매물 한 건. 다른 샵 매물이거나 id 모양이 아니면 null */
export async function selectSlotForEdit(
  db: Pick<Db, 'select'>,
  shopId: string,
  slotId: string,
): Promise<SlotForEdit | null> {
  if (!slotIdSchema.safeParse(slotId).success) return null;
  const [row] = await db
    .select({
      id: slots.id,
      menuId: slots.menuId,
      menuName: slots.menuName,
      status: slots.status,
      startAt: slots.startAt,
      endAt: slots.endAt,
      publishAt: slots.publishAt,
      discountRate: slots.discountRate,
      newCustomerOnly: slots.newCustomerOnly,
      holdCustomerId: slots.holdCustomerId,
      holdExpiresAt: slots.holdExpiresAt,
    })
    .from(slots)
    .where(and(eq(slots.id, slotId), eq(slots.shopId, shopId)));
  if (!row) return null;
  // status는 DB 제약(slots_status_check), 할인율은 저장할 때 선택지만 받는다
  return {
    ...row,
    status: row.status as SlotStatus,
    discountRate: row.discountRate as DiscountRate,
  };
}

/** 지금 고칠 수 있는지 본다. 없는 매물이거나 고칠 수 없으면 이유 */
export async function checkEditable(
  db: Pick<Db, 'select'>,
  shopId: string,
  slotId: string,
  now: Date,
): Promise<Result<SlotForEdit>> {
  const slot = await selectSlotForEdit(db, shopId, slotId);
  if (!slot) return failWith('SLOT_NOT_FOUND');
  const problem = slotEditProblem(slot, now);
  return problem ? failWith(problem) : ok(slot);
}

/** 조건부 저장이 막혔을 때 이유. 다시 읽었더니 고칠 수 있으면 그사이 상태가 바뀐 것이다 */
async function blockedReason(
  db: Pick<Db, 'select'>,
  shopId: string,
  slotId: string,
  now: Date,
): Promise<Result<never>> {
  const checked = await checkEditable(db, shopId, slotId, now);
  return checked.ok ? failWith('SLOT_CHANGED') : checked;
}

/** 판매 전 매물을 마감한다(S-206). 사유와 시각을 남긴다. 마감한 매물은 겹침 검사에서 빠진다 */
export async function closeSlotInDb(
  db: Pick<Db, 'select' | 'update'>,
  shopId: string,
  slotId: string,
  reason: unknown,
  now: Date,
): Promise<Result<null>> {
  const parsed = closeReasonSchema.safeParse(reason);
  if (!parsed.success) return fail('INVALID_CLOSE_REASON', '마감 사유를 골라 주세요');
  if (!slotIdSchema.safeParse(slotId).success) return failWith('SLOT_NOT_FOUND');

  const [row] = await db
    .update(slots)
    .set({ status: 'closed', closedAt: now, closeReason: parsed.data })
    .where(and(eq(slots.id, slotId), eq(slots.shopId, shopId), editableNow(now)))
    .returning({ id: slots.id });
  return row ? ok(null) : blockedReason(db, shopId, slotId, now);
}

/**
 * 판매 전 매물을 ①②③ 고른 값으로 고친다. 등록(createSlotInDb)과 같은 검증을 하고, 겹침에서는 자기 자신을 뺀다.
 * 메뉴 값은 고칠 때의 값을 다시 복사하고 할인가는 서버가 다시 계산한다.
 * 게시 시각: 이미 게시중인 매물은 그대로 둔다. 관심 지역 새 매물 알림(C-601)이 publish_at으로 "그날 새로 올라온 매물"을
 * 모으므로, 고칠 때마다 바꾸면 며칠 전 매물이 새 매물로 다시 알려진다(#169 리뷰). 예약대기 매물은 등록처럼 지금 게시한다
 */
export async function updateSlotInDb(
  db: Pick<Db, 'transaction'>,
  shopId: string,
  slotId: string,
  input: unknown,
  now: Date,
): Promise<Result<SavedSlot>> {
  const pricing = parseSlotPricing(input);
  if (!pricing) return fail('INVALID_DISCOUNT_RATE', SLOT_PRICING_ERROR);

  try {
    return await db.transaction(async (tx) => {
      // 고칠 수 없는 매물이면 시간·메뉴 검증보다 그 이유를 먼저 알려준다
      const editable = await checkEditable(tx, shopId, slotId, now);
      if (!editable.ok) return editable;

      const draft = await validateSlotDraft(tx, shopId, input, now, { excludeSlotId: slotId });
      if (!draft.ok) return draft;
      // 예약대기 매물만 지금 게시한다(미리 게시 S-205는 P1에서 다시 본다)
      const publishNow = getSlotStatus(editable.data, now) === 'scheduled';
      const values = slotValuesFrom(draft.data, pricing);
      const [row] = await tx
        .update(slots)
        .set({
          ...values,
          ...(publishNow ? { publishAt: now } : {}),
          status: 'published',
        })
        .where(and(eq(slots.id, slotId), eq(slots.shopId, shopId), editableNow(now)))
        .returning({ id: slots.id });
      if (!row) return blockedReason(tx, shopId, slotId, now);
      return ok({ slotId: row.id, salePrice: values.salePrice });
    });
  } catch (error) {
    return overlapFailure(error);
  }
}
