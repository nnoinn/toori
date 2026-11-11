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
import { type PublishPlan, publishPlan } from './slot-time';

type Db = Pick<ReturnType<typeof getDb>, 'transaction'>;

/** 저장한(등록·수정·재등록) 매물. 할인가는 서버가 계산한 값이라 완료 화면이 이 값을 보여준다 */
export type SavedSlot = {
  slotId: string;
  salePrice: number;
  /** 예약대기로 저장했으면 고객에게 보이기 시작하는 게시 시각(ISO). 지금 게시중이면 null(S-205) */
  publishAt: string | null;
};

/** 저장한 게시 상태를 완료 화면 값으로. 예약대기일 때만 게시 시각을 알려 준다 */
export function scheduledPublishAt(plan: PublishPlan): string | null {
  return plan.status === 'scheduled' ? plan.publishAt.toISOString() : null;
}

/** 재등록(O13, S-408)으로 만드는 매물이면 원래(취소된) 매물 */
export type CreateSlotOptions = { relistedFromSlotId?: string };

/**
 * ①②③ 고른 값으로 매물을 저장한다. 시작이 48시간보다 멀면 예약대기로, 시작 48시간 전을 게시 시각으로
 * 저장하고, 그 안이면 지금 게시중으로 저장한다(publishPlan, S-205). 메뉴 값은 등록 당시 값을 복사한다(D12).
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
      const plan = publishPlan(draft.data.start, now);
      const [row] = await tx
        .insert(slots)
        .values({ shopId, ...values, ...plan, relistedFromSlotId, createdBy })
        .returning({ id: slots.id });
      return ok({
        slotId: row.id,
        salePrice: values.salePrice,
        publishAt: scheduledPublishAt(plan),
      });
    });
  } catch (error) {
    return overlapFailure(error);
  }
}
