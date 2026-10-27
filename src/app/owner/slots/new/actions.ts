'use server';

// 매물 등록 서버 함수 (O4, S-201). 화면(slot-create-form.tsx)에서 부른다.
// O4는 ①② 고른 값을 확인만 한다. 저장은 O5에서 ③ 할인율과 함께 한다.

import { getDb } from '@/db';
import { ok, type Result } from '@/lib/result';
import { requireShopOwner } from '@/server/auth';
import { assertShopApproved } from '@/server/shops';

import { validateSlotDraft } from './slot-draft-store';

/** ①② 고른 메뉴·시작 시각이 올릴 수 있는 것인지 본다. 끝 시각(ISO)을 돌려준다 */
export async function checkSlotDraft(
  shopId: string,
  input: unknown,
): Promise<Result<{ endAt: string }>> {
  const auth = await requireShopOwner(shopId);
  if (!auth.ok) return auth;
  const approved = await assertShopApproved(shopId);
  if (!approved.ok) return approved;

  const draft = await validateSlotDraft(getDb(), shopId, input, new Date());
  if (!draft.ok) return draft;
  return ok({ endAt: draft.data.end.toISOString() });
}
