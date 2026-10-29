// 매물 배지·홀딩 판단 (C-203, C-306, C-308, C-404). 목록(J4)과 상세(J7)가 같이 쓴다. 서버 시각으로 정한다.

import type { SlotBadgeKind } from '@/components/ui/slot-badge';
import { isSlotOnHold } from '@/features/slot-status/slot-status';
import { getSlotTimeFlags } from '@/server/policy';

export type SlotBadgeInput = {
  startAt: Date;
  newCustomerOnly: boolean;
  holdCustomerId: string | null;
  holdExpiresAt: Date | null;
};

/** 지금 다른 고객이 홀딩 중인지. 내가 홀딩한 매물은 아니다 */
export function isHeldByOther(slot: SlotBadgeInput, customerId: string | null, now: Date): boolean {
  return isSlotOnHold(slot, now) && (customerId === null || slot.holdCustomerId !== customerId);
}

/** 지금 내가 홀딩 중인지(#57 답: 본인용 표시) */
export function isHeldByMe(slot: SlotBadgeInput, customerId: string | null, now: Date): boolean {
  return customerId !== null && isSlotOnHold(slot, now) && slot.holdCustomerId === customerId;
}

/** 카드·상세 배지. 순서는 공통 UI SlotBadges가 다시 맞춘다 */
export function slotBadges(
  slot: SlotBadgeInput,
  customerId: string | null,
  now: Date,
): SlotBadgeKind[] {
  const flags = getSlotTimeFlags(slot.startAt, now);
  const badges: SlotBadgeKind[] = [];
  if (flags.nonRefundable) badges.push('nonRefundable');
  if (flags.imminent) badges.push('imminent');
  if (slot.newCustomerOnly) badges.push('newCustomerOnly');
  if (isHeldByOther(slot, customerId, now)) badges.push('onHold');
  return badges;
}
