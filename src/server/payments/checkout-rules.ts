// 홀딩할 수 있는 매물인지 (C-404, X-304). DB를 보지 않는 계산만 둔다. now는 서버 시각.
// 매물 상태는 정민석 연결 #16(slot-status)으로 계산한다. W10의 DB 업데이트 조건(slotStatusIs·slotIsOnHold)과 같은 규칙이다.

import { getSlotStatus, isSlotOnHold } from '@/features/slot-status/slot-status';

import type { CheckoutSlot } from './checkout-store';

/** 막히는 이유. 홀딩할 수 있으면 null. 신규 고객 전용(DB 조회)은 따로 본다 */
export function holdBlockReason(
  slot: CheckoutSlot,
  customerId: string,
  now: Date,
): 'SLOT_NOT_AVAILABLE' | 'HELD_BY_OTHER' | null {
  if (getSlotStatus(slot, now) !== 'published') return 'SLOT_NOT_AVAILABLE';
  if (isSlotOnHold(slot, now) && slot.holdCustomerId !== customerId) return 'HELD_BY_OTHER';
  return null;
}
