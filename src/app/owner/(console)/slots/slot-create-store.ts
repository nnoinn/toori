// 매물 등록 저장 (DB, O5, S-201·S-203·S-209). 서버에서만 부른다. 권한·입점 승인은 부른 쪽이 먼저 확인한다.
// 트랜잭션 안에서 ①② 검증(validateSlotDraft)을 다시 하고 저장한다. 그사이 다른 요청이 같은 시간에 먼저 저장했으면
// DB 제약(slots_no_overlap)이 막으므로, 버튼을 두 번 눌러도 매물은 하나만 생긴다.

import 'server-only';

import { getDb } from '@/db';
import { slots } from '@/db/schema';
import { fail, ok, type Result } from '@/lib/result';

import { validateSlotDraft } from './slot-draft-store';
import { parseSlotPricing, SLOT_PRICING_ERROR } from './slot-pricing';
import { overlapFailure, slotValuesFrom } from './slot-save';

type Db = Pick<ReturnType<typeof getDb>, 'transaction'>;

/** 저장한(등록·수정·재등록) 매물. 할인가는 서버가 계산한 값이라 완료 화면이 이 값을 보여준다 */
export type SavedSlot = { slotId: string; salePrice: number };

/** 재등록(O13, S-408)으로 만드는 매물이면 원래(취소된) 매물 */
export type CreateSlotOptions = { relistedFromSlotId?: string };

/**
 * ①②③ 고른 값으로 매물을 저장한다. 지금은 48시간 안의 시각만 고를 수 있어서 바로 게시중으로 저장한다
 * (미리 만들어 두는 예약 게시 S-205는 P1). 메뉴 값은 등록 당시 값을 복사한다(D12).
 * 취소 시간대 재등록(relist-store.ts)도 같은 확인을 거치도록 이 함수를 쓰고, 원래 매물을 relistedFromSlotId로 넘긴다
 */
export async function createSlotInDb(
  db: Db,
  shopId: string,
  createdBy: string,
  input: unknown,
  now: Date,
  { relistedFromSlotId }: CreateSlotOptions = {},
): Promise<Result<SavedSlot>> {
  const pricing = parseSlotPricing(input);
  if (!pricing) return fail('INVALID_DISCOUNT_RATE', SLOT_PRICING_ERROR);

  try {
    return await db.transaction(async (tx) => {
      const draft = await validateSlotDraft(tx, shopId, input, now);
      if (!draft.ok) return draft;
      const values = slotValuesFrom(draft.data, pricing);
      const [row] = await tx
        .insert(slots)
        .values({
          shopId,
          ...values,
          publishAt: now,
          status: 'published',
          relistedFromSlotId,
          createdBy,
        })
        .returning({ id: slots.id });
      return ok({ slotId: row.id, salePrice: values.salePrice });
    });
  } catch (error) {
    return overlapFailure(error);
  }
}
