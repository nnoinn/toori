// 시간대 매물 실패 흉내 스위치 (#308). 서버에서만 부른다. 진짜 버전 ④에서 이 파일을 지운다.
// 원장님 등록·지난 설정·마감(①)과 고객 목록·상세(②)는 진짜 시간대 표를 읽고 쓴다. 가짜 시간대 데이터(DEV_FAKE_SLOT_WINDOWS)는 ②에서 없앴다.
//
// - DEV_FAKE_SLOT_WINDOWS_FAILURE=<함수>:<코드>: 로컬 개발(NODE_ENV=development)에서 그 함수가 그 실패를 돌려준다. 예: holdWindowSlot:TIME_TAKEN

import 'server-only';

import type { ResultError } from '@/lib/result';
import { PAYMENT_ERRORS } from '@/server/payments/errors';

import { SLOT_WINDOW_ERRORS } from './errors';

const SWITCHABLE = {
  createSlotWindows: [
    'INVALID_INPUT',
    'MENU_NOT_FOUND',
    'MENU_TOO_LONG',
    'WINDOW_OVERLAP',
    'PAST',
    'TOO_FAR',
    'OUTSIDE_HOURS',
    'CLOSED_DAY',
  ],
  closeSlotWindow: ['WINDOW_NOT_FOUND', 'WINDOW_CLOSED'],
  holdWindowSlot: ['SLOT_NOT_AVAILABLE', 'ALREADY_HOLDING', 'NEW_CUSTOMER_ONLY', 'TIME_TAKEN'],
} as const;

/** DEV_FAKE_SLOT_WINDOWS_FAILURE가 이 함수를 가리키면 그 실패, 아니면 null */
export function fakeWindowFailure(
  fn: keyof typeof SWITCHABLE,
): { ok: false; error: ResultError } | null {
  if (process.env.NODE_ENV !== 'development') return null;
  const [target, code = ''] = (process.env.DEV_FAKE_SLOT_WINDOWS_FAILURE ?? '').split(':');
  if (target !== fn) return null;
  const allowed: readonly string[] = SWITCHABLE[fn];
  if (!allowed.includes(code)) {
    console.warn(`[slot-windows] ${fn}에서 흉내 낼 수 없는 실패 코드예요: ${code}`);
    return null;
  }
  const messages: Record<string, string> = { ...SLOT_WINDOW_ERRORS, ...PAYMENT_ERRORS };
  return { ok: false, error: { code, message: messages[code] } };
}
