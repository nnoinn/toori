'use server';

// 매물 수정·마감 서버 함수 (O10, S-206). 대시보드의 [마감]과 수정 화면(slots/[slotId]/edit)에서 부른다.
// 수정은 등록(new/actions.ts)과 같은 순서다: ①② 고르면 checkSlotEdit로 확인, ③까지 고르면 updateSlot으로 저장.

import { refresh } from 'next/cache';

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { ok, type Result } from '@/lib/result';
import { requireShopOwner } from '@/server/auth';
import { assertShopApproved } from '@/server/shops';

import type { CreatedSlot } from './new/slot-create-store';
import { validateSlotDraft } from './new/slot-draft-store';
import { checkEditable, closeSlotInDb, updateSlotInDb } from './slot-edit-store';

async function allowed(shopId: string): Promise<Result<null>> {
  const auth = await requireShopOwner(shopId);
  if (!auth.ok) return auth;
  const approved = await assertShopApproved(shopId);
  if (!approved.ok) return approved;
  return ok(null);
}

/** 판매 전 매물을 마감한다. 사유: other_channel(다른 곳 예약) / mistake(잘못 올림) / other(기타) */
export async function closeSlot(
  shopId: string,
  slotId: string,
  reason: unknown,
): Promise<Result<null>> {
  const check = await allowed(shopId);
  if (!check.ok) return check;

  const closed = await closeSlotInDb(getDb(), shopId, slotId, reason, await getRequestNow());
  // 대시보드 목록에 마감 상태가 바로 보이게 화면 값을 다시 받는다
  if (closed.ok) refresh();
  return closed;
}

/** 수정 ①② 고른 메뉴·시작 시각이 올릴 수 있는 것인지 본다. 고치는 매물 자신과는 겹쳐도 된다 */
export async function checkSlotEdit(
  shopId: string,
  slotId: string,
  input: unknown,
): Promise<Result<{ endAt: string }>> {
  const check = await allowed(shopId);
  if (!check.ok) return check;

  const db = getDb();
  const now = await getRequestNow();
  const editable = await checkEditable(db, shopId, slotId, now);
  if (!editable.ok) return editable;
  const draft = await validateSlotDraft(db, shopId, input, now, { excludeSlotId: slotId });
  if (!draft.ok) return draft;
  return ok({ endAt: draft.data.end.toISOString() });
}

/** ①②③ 고른 값으로 판매 전 매물을 고친다. 할인가는 서버가 다시 계산한다 */
export async function updateSlot(
  shopId: string,
  slotId: string,
  input: unknown,
): Promise<Result<CreatedSlot>> {
  const check = await allowed(shopId);
  if (!check.ok) return check;

  const updated = await updateSlotInDb(getDb(), shopId, slotId, input, await getRequestNow());
  if (updated.ok) refresh();
  return updated;
}
