'use server';

// 매물 등록 서버 함수 (O4·O5, S-201). 화면(slot-form.tsx)에서 부른다.
// ①②를 고르면 checkSlotDraft로 확인하고, ③까지 고르면 createSlot으로 저장한다.
// 운영자가 새 매물 게시를 멈춘 샵(#373 ④)이면 둘 다 PUBLISH_PAUSED로 막는다(#472). 수정·마감은 막지 않는다

import { refresh } from 'next/cache';

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { ok, type Result } from '@/lib/result';
import { assertShopCanPublish } from '@/server/shops';

import { requireApprovedOwner } from '../require-approved-owner';
import { createSlotInDb, type SavedSlot } from '../slot-create-store';
import { validateSlotDraft } from '../slot-draft-store';

/** ①② 고른 메뉴·시작 시각이 올릴 수 있는 것인지 본다. 끝 시각(ISO)을 돌려준다 */
export async function checkSlotDraft(
  shopId: string,
  input: unknown,
): Promise<Result<{ endAt: string }>> {
  const auth = await requireApprovedOwner(shopId);
  if (!auth.ok) return auth;
  const publishable = await assertShopCanPublish(shopId);
  if (!publishable.ok) return publishable;

  const draft = await validateSlotDraft(getDb(), shopId, input, await getRequestNow());
  if (!draft.ok) return draft;
  return ok({ endAt: draft.data.end.toISOString() });
}

/** ①②③ 고른 값으로 매물을 저장한다(O5). 할인가는 서버가 계산한다 */
export async function createSlot(shopId: string, input: unknown): Promise<Result<SavedSlot>> {
  const auth = await requireApprovedOwner(shopId);
  if (!auth.ok) return auth;
  const publishable = await assertShopCanPublish(shopId);
  if (!publishable.ok) return publishable;

  const created = await createSlotInDb(
    getDb(),
    shopId,
    auth.data.userId,
    input,
    await getRequestNow(),
  );
  // 다음 매물을 올릴 때 방금 올린 시간이 겹침으로 보이게 화면 값을 다시 받는다
  if (created.ok) refresh();
  return created;
}
