// 매물 등록 저장 (DB, O5, S-201·S-203·S-209). 서버에서만 부른다. 권한·입점 승인은 부른 쪽이 먼저 확인한다.
// 트랜잭션 안에서 ①② 검증(validateSlotDraft)을 다시 하고 저장한다. 그사이 다른 요청이 같은 시간에 먼저 저장했으면
// DB 제약(slots_no_overlap)이 막으므로, 버튼을 두 번 눌러도 매물은 하나만 생긴다.

import 'server-only';

import { DrizzleQueryError } from 'drizzle-orm';

import { getDb } from '@/db';
import { slots } from '@/db/schema';
import { fail, ok, type Result } from '@/lib/result';
import { calcSalePrice } from '@/server/policy';

import { SLOT_DRAFT_ERRORS, validateSlotDraft } from './slot-draft-store';
import { parseSlotPricing, SLOT_PRICING_ERROR } from './slot-pricing';

type Db = Pick<ReturnType<typeof getDb>, 'transaction'>;

export type CreatedSlot = { slotId: string; salePrice: number };

/**
 * ①②③ 고른 값으로 매물을 저장한다. 지금은 48시간 안의 시각만 고를 수 있어서 바로 게시중으로 저장한다
 * (미리 만들어 두는 예약 게시 S-205는 P1). 메뉴 값은 등록 당시 값을 복사한다(D12)
 */
export async function createSlotInDb(
  db: Db,
  shopId: string,
  createdBy: string,
  input: unknown,
  now: Date,
): Promise<Result<CreatedSlot>> {
  const pricing = parseSlotPricing(input);
  if (!pricing) return fail('INVALID_DISCOUNT_RATE', SLOT_PRICING_ERROR);

  try {
    return await db.transaction(async (tx) => {
      const draft = await validateSlotDraft(tx, shopId, input, now);
      if (!draft.ok) return draft;
      const { menu, start, end } = draft.data;
      const salePrice = calcSalePrice(menu.listPrice, pricing.discountRate);
      const [row] = await tx
        .insert(slots)
        .values({
          shopId,
          menuId: menu.id,
          serviceType: menu.serviceType,
          menuName: menu.name,
          menuDescription: menu.description,
          listPrice: menu.listPrice,
          durationMinutes: menu.durationMinutes,
          discountRate: pricing.discountRate,
          salePrice,
          newCustomerOnly: pricing.newCustomerOnly,
          startAt: start,
          endAt: end,
          publishAt: now,
          status: 'published',
          createdBy,
        })
        .returning({ id: slots.id });
      return ok({ slotId: row.id, salePrice });
    });
  } catch (error) {
    if (violated(error) === 'slots_no_overlap') {
      return fail('SLOT_OVERLAP', SLOT_DRAFT_ERRORS.SLOT_OVERLAP);
    }
    throw error;
  }
}

/** 쿼리가 어긴 DB 제약 이름 */
function violated(error: unknown): string | undefined {
  const cause = error instanceof DrizzleQueryError ? error.cause : error;
  return (cause as { constraint_name?: string } | undefined)?.constraint_name;
}
