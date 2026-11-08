// 매물 저장(등록 createSlotInDb, 수정 updateSlotInDb)이 같이 쓰는 것 (O5·O10, S-203·S-209). 서버에서만 부른다.
// 매물에 넣는 값과 시간 겹침 오류 처리를 한 곳에 둬서, 등록과 수정이 한쪽만 바뀌는 일이 없게 한다.

import 'server-only';

import { violatedConstraint } from '@/lib/db-error';
import { fail, type Result } from '@/lib/result';
import { calcSalePrice } from '@/server/policy';

import { SLOT_DRAFT_ERRORS, type SlotDraft } from './slot-draft-store';
import type { SlotPricing } from './slot-pricing';

/**
 * ①② 검증한 값과 ③ 할인율로 매물에 넣을 값. 메뉴 값은 저장하는 때의 메뉴에서 복사해 두고(D12,
 * 나중에 메뉴를 고쳐도 매물은 그대로), 할인가는 화면 값을 믿지 않고 서버가 정가·할인율로 다시 계산한다(S-203)
 */
export function slotValuesFrom({ menu, start, end }: SlotDraft, pricing: SlotPricing) {
  return {
    menuId: menu.id,
    serviceType: menu.serviceType,
    menuName: menu.name,
    menuDescription: menu.description,
    listPrice: menu.listPrice,
    durationMinutes: menu.durationMinutes,
    discountRate: pricing.discountRate,
    salePrice: calcSalePrice(menu.listPrice, pricing.discountRate),
    newCustomerOnly: pricing.newCustomerOnly,
    startAt: start,
    endAt: end,
  };
}

/**
 * 저장하다 난 오류 처리. 시간 겹침 제약(slots_no_overlap)이면 "같은 시간에 이미 올린 매물이 있어요"로 답한다.
 * 확인과 저장 사이에 다른 요청이 같은 시간에 먼저 저장한 경우다. 다른 오류는 그대로 다시 던진다
 */
export function overlapFailure(error: unknown): Result<never> {
  if (violatedConstraint(error) === 'slots_no_overlap') {
    return fail('SLOT_OVERLAP', SLOT_DRAFT_ERRORS.SLOT_OVERLAP);
  }
  throw error;
}
