// 취소 시간대 재등록 규칙 (O13, S-408·S-208, 연결 #14·#132). 화면('use client')과 서버가 같이 쓴다.
// 취소된 매물을 같은 조건(메뉴·시간·할인율·신규 고객 전용)의 새 매물로 바로 게시한다. 원래 매물은 '취소'로 남긴다.
// 서비스 시작 시각이 지났거나 이미 재등록한 매물은 재등록할 수 없다(#132 제안대로 두 번 막기).
// 누가 취소했는지(고객·자동·운영자)와는 상관없다. 원장님이 원할 때만 누르는 버튼이라서다.

import type { SlotStatus } from '@/db/schema/slots';

/** 재등록할 수 있는지 볼 매물 값 */
export type RelistTarget = {
  status: SlotStatus;
  /** 서비스 시작 시각 */
  startAt: Date;
  /** 이 매물로 재등록한 새 매물. 없으면 null */
  relistedSlotId: string | null;
};

export type RelistProblem =
  'SLOT_NOT_FOUND' | 'NOT_CANCELLED' | 'ALREADY_RELISTED' | 'START_PASSED';

export const RELIST_MESSAGES: Record<RelistProblem, string> = {
  SLOT_NOT_FOUND: '매물을 찾을 수 없어요',
  NOT_CANCELLED: '예약이 취소된 매물만 재등록할 수 있어요',
  ALREADY_RELISTED: '이미 재등록한 매물이에요',
  START_PASSED: '서비스 시작 시각이 지나서 재등록할 수 없어요',
};

/** 지금 재등록할 수 없는 이유. 할 수 있으면 null. now는 서버 시각(getRequestNow) */
export function relistProblem(target: RelistTarget, now: Date): RelistProblem | null {
  if (target.status !== 'cancelled') return 'NOT_CANCELLED';
  if (target.relistedSlotId !== null) return 'ALREADY_RELISTED';
  // 등록과 같은 기준: 시작 시각과 같거나 지났으면 올릴 수 없다(slot-time.ts checkStart)
  if (target.startAt.getTime() <= now.getTime()) return 'START_PASSED';
  return null;
}

/** 대시보드 '취소' 매물 줄에 [재등록]을 보여줄지 */
export function canRelist(target: RelistTarget, now: Date): boolean {
  return relistProblem(target, now) === null;
}

/**
 * 등록 확인(validateSlotDraft)이 막았을 때 재등록 화면에 보여줄 문구.
 * 메뉴를 숨겼거나 업종을 바꿨으면 등록 화면의 "메뉴를 다시 골라 주세요" 대신 새로 올리라고 안내한다
 */
export function relistDraftMessage(code: string, message: string): string {
  if (code === 'MENU_NOT_FOUND') {
    return '이 매물의 메뉴를 숨겼거나 업종을 바꿔서 재등록할 수 없어요. 매물 등록에서 새로 올려 주세요';
  }
  return message;
}
