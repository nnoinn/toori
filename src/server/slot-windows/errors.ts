// 시간대 매물의 실패 코드와 화면 문구 (#308). 화면은 error.message를 그대로 보여주고, 코드로 다음 행동을 고른다.
// 시작 시각·영업시간 문제는 매물 등록과 같은 코드·문구다(정민석 slot-time.ts). 화면과 서버 어디서나 가져올 수 있다.

import {
  HOURS_PROBLEM_MESSAGES,
  START_PROBLEM_MESSAGES,
} from '@/app/owner/(console)/slots/slot-time';
import type { ResultError } from '@/lib/result';

export const SLOT_WINDOW_ERRORS = {
  /** 묶음·서비스가 없거나 모양이 틀림, 할인율이 선택지에 없음, 같은 메뉴를 두 번, 묶음끼리 겹침 */
  INVALID_INPUT: '입력한 내용을 다시 확인해 주세요',
  /** 내 샵 메뉴가 아니거나 숨긴 메뉴 */
  MENU_NOT_FOUND: '서비스를 다시 골라 주세요',
  /** 그 메뉴가 들어가는 묶음이 없음(소요 시간이 가장 긴 묶음보다 김) */
  MENU_TOO_LONG:
    '고른 시간보다 소요 시간이 긴 서비스가 있어요. 시간을 늘리거나 그 서비스를 빼 주세요',
  /** 같은 시간에 이미 올린 매물이나 시간대가 있음 */
  WINDOW_OVERLAP: '같은 시간에 이미 올린 매물이나 시간대가 있어요',
  /** 마감: 없는 시간대이거나 내 샵 시간대가 아님 */
  WINDOW_NOT_FOUND: '시간대를 찾을 수 없어요',
  /** 마감: 이미 마감했거나 시간이 지남 */
  WINDOW_CLOSED: '이미 마감한 시간대예요',
  ...START_PROBLEM_MESSAGES,
  ...HOURS_PROBLEM_MESSAGES,
} as const;

export type SlotWindowErrorCode = keyof typeof SLOT_WINDOW_ERRORS;

export type SlotWindowResult<T> = { ok: true; data: T } | { ok: false; error: ResultError };

export function slotWindowFail(code: SlotWindowErrorCode): { ok: false; error: ResultError } {
  return { ok: false, error: { code, message: SLOT_WINDOW_ERRORS[code] } };
}
