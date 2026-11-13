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

/**
 * 시간대 카드 배지(#308). 가장 빠른 시작이 임박이면 임박, 신규 고객 전용이면 신규 고객 전용.
 * 환불 불가는 고르는 시각에 따라 달라서 카드에는 붙이지 않는다(상세에서 시각을 고르면 붙는다).
 * 홀딩은 시간대가 아니라 손님이 고른 시각 하나에 걸리므로 결제 중 배지도 없다
 */
export function windowBadges(
  window: { earliestStartAt: Date; newCustomerOnly: boolean },
  now: Date,
): SlotBadgeKind[] {
  const badges: SlotBadgeKind[] = [];
  if (getSlotTimeFlags(window.earliestStartAt, now).imminent) badges.push('imminent');
  if (window.newCustomerOnly) badges.push('newCustomerOnly');
  return badges;
}
