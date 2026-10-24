// 매물 상태 계산 (X-301, X-302, 연결 #16). 화면('use client')과 서버 어디서나 쓴다.
// 입출력 약속은 Issue #57을 따른다. 바꿀 일이 생기면 #57에 먼저 알린다.
//
// DB에는 일이 일어날 때만 상태를 저장하고, 시간이 지나서 바뀌는 상태는 여기서 계산한다(docs/schema-v1.md 3장).
// - 예약대기(scheduled)로 저장됐어도 게시 시각이 지나면 게시중
// - 예약대기·게시중으로 저장됐어도 시작 시각이 지나면 마감(팔리지 않고 시작이 지남)
// 같은 규칙의 DB 조건은 slot-status-sql.ts에 있다. 두 파일은 늘 같은 답을 내야 한다.
// "지금"은 함수 안에서 만들지 않고 서버 시각(getRequestNow())을 받는다.

import type { SlotStatus } from '@/db/schema/slots';

export type { SlotStatus };

/** 화면에 보여줄 상태 이름 */
export const SLOT_STATUS_LABELS: Record<SlotStatus, string> = {
  scheduled: '예약대기',
  published: '게시중',
  reserved: '예약됨',
  closed: '마감',
  cancelled: '취소',
  completed: '완료',
};

export type SlotStatusInput = { status: SlotStatus; publishAt: Date; startAt: Date };
export type SlotHoldInput = { holdCustomerId: string | null; holdExpiresAt: Date | null };

/** 지금 화면에 보여줄 상태. 게시 시각·시작 시각과 같은 순간부터 다음 상태로 본다 */
export function getSlotStatus(slot: SlotStatusInput, now: Date): SlotStatus {
  const nowMs = now.getTime();
  switch (slot.status) {
    case 'scheduled':
    case 'published':
      if (nowMs >= slot.startAt.getTime()) return 'closed';
      if (slot.status === 'scheduled' && nowMs < slot.publishAt.getTime()) return 'scheduled';
      return 'published';
    default:
      // 예약됨은 시작이 지나도 방문·노쇼 처리 전까지 예약됨이다
      return slot.status;
  }
}

/** 홀딩한 고객이 있고 만료 시각 전이면 true. 홀딩은 상태가 아니라 게시중 매물에 따로 붙는 표시다 */
export function isSlotOnHold(slot: SlotHoldInput, now: Date): boolean {
  return (
    slot.holdCustomerId !== null &&
    slot.holdExpiresAt !== null &&
    now.getTime() < slot.holdExpiresAt.getTime()
  );
}

/** 원장님이 수정·마감할 수 있으면 true. 판매 전(예약대기·게시중)이고 홀딩 중이 아닐 때만 (S-206) */
export function canEditSlot(slot: SlotStatusInput & SlotHoldInput, now: Date): boolean {
  const status = getSlotStatus(slot, now);
  return (status === 'scheduled' || status === 'published') && !isSlotOnHold(slot, now);
}
