// 목록·매물 수·통계에서 뺄 매물 조건 (#308 ④, 11/11 nnoinn). 서버에서만 부른다.
// 손님이 시간대 안에서 [예약하기]로 만든 칸을 결제 없이 비우면 그 칸은 마감(사유 hold_released)으로 남는다.
// 원장님이 올린 매물이 아니라서 원장님 대시보드·예약 현황·운영자 목록·통계에서는 뺀다.
// 원장님이 올린 시간대와 결제가 끝난 예약은 그대로 보인다(schema-v1 slots.close_reason).
// 손님이 결제 중인 시간대 칸(아직 예약 전)도 원장님이 올린 매물이 아니라서 같이 뺀다(ownerListedSlot, #308 ③, 11/11 결정 ④
// "결제까지 끝난 예약만 보여요").

import 'server-only';

import { and, isNull, ne, notInArray, or, type SQL } from 'drizzle-orm';

import { slots } from '@/db/schema';

/**
 * 결제 없이 홀딩이 끝난 시간대 칸(hold_released)이 아닌 매물만. 목록은 where에, 수를 세는 left join은 join 조건에 넣는다
 * (where에 넣으면 매물이 없는 샵 줄까지 빠진다).
 * 예: .where(and(notHoldReleasedSlot(), ...)), .leftJoin(slots, and(eq(slots.shopId, shops.id), notHoldReleasedSlot()))
 */
export function notHoldReleasedSlot(): SQL {
  return or(isNull(slots.closeReason), ne(slots.closeReason, 'hold_released'))!;
}

/**
 * 원장님이 올린 매물과 결제가 끝난 시간대 칸만(#308 ③). 결제 없이 비운 칸(hold_released)과 손님이 아직 결제 중인 시간대 칸
 * (window_id가 있고 게시예정·게시중)을 뺀다. 원장님 대시보드·예약 현황, 운영자 매물 목록·원장님 매물 수에 쓴다.
 * 넣는 자리는 notHoldReleasedSlot()과 같다(목록은 where, 수를 세는 left join은 join 조건)
 */
export function ownerListedSlot(): SQL {
  return and(
    notHoldReleasedSlot(),
    or(isNull(slots.windowId), notInArray(slots.status, ['scheduled', 'published'])),
  )!;
}
