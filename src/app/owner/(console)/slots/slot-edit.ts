// 매물 수정·마감 규칙 (O10, S-206). 화면('use client')과 서버가 같이 쓴다.
// 판매 전(예약대기·게시중)이고 홀딩 중이 아닌 매물만 고치거나 마감할 수 있다(O1 canEditSlot과 같은 답).
// 막히면 이유를 원장님에게 알려준다. 매물을 지우는 기능은 없다.

import type { SlotCloseReason } from '@/db/schema/slots';
import {
  getSlotStatus,
  isSlotOnHold,
  type SlotHoldInput,
  type SlotStatusInput,
} from '@/features/slot-status/slot-status';

/** 원장님 직접 마감 사유(S-206) */
export const SLOT_CLOSE_REASON_LABELS: Record<SlotCloseReason, string> = {
  other_channel: '다른 곳 예약',
  mistake: '잘못 올림',
  other: '기타',
};

export const SLOT_CLOSE_REASON_OPTIONS = Object.keys(SLOT_CLOSE_REASON_LABELS) as SlotCloseReason[];

export type SlotEditProblem =
  | 'SLOT_NOT_FOUND'
  | 'SLOT_ON_HOLD'
  | 'SLOT_RESERVED'
  | 'SLOT_CLOSED'
  | 'SLOT_ENDED'
  | 'SLOT_CHANGED';

export const SLOT_EDIT_MESSAGES: Record<SlotEditProblem, string> = {
  SLOT_NOT_FOUND: '매물을 찾을 수 없어요',
  SLOT_ON_HOLD: '고객이 결제 중이라 지금은 고치거나 마감할 수 없어요. 잠시 뒤에 다시 해 주세요',
  SLOT_RESERVED: '이미 예약된 매물이라 고치거나 마감할 수 없어요',
  SLOT_CLOSED: '이미 마감된 매물이에요',
  SLOT_ENDED: '판매가 끝난 매물이라 고치거나 마감할 수 없어요',
  SLOT_CHANGED: '매물 상태가 바뀌었어요. 화면을 새로 보고 다시 해 주세요',
};

/** 지금 고치거나 마감할 수 없는 이유. 할 수 있으면 null */
export function slotEditProblem(
  slot: SlotStatusInput & SlotHoldInput,
  now: Date,
): SlotEditProblem | null {
  switch (getSlotStatus(slot, now)) {
    case 'scheduled':
    case 'published':
      return isSlotOnHold(slot, now) ? 'SLOT_ON_HOLD' : null;
    case 'reserved':
      return 'SLOT_RESERVED';
    case 'closed':
      return 'SLOT_CLOSED';
    default:
      return 'SLOT_ENDED';
  }
}
