// 운영자 매물 관리(#373 ④: 새 매물 게시 멈춤·다시 열기, 매물·시간대 매물 강제 마감)의 실패 코드와 화면 문구.
// 화면과 서버 어디서나 가져올 수 있다.

import { fail } from '@/lib/result';
import { ADMIN_REASON_LIMIT } from '@/server/policy/admin';

export const ADMIN_SLOT_ERRORS = {
  SHOP_NOT_FOUND: '샵을 찾을 수 없어요',
  SLOT_NOT_FOUND: '매물을 찾을 수 없어요',
  WINDOW_NOT_FOUND: '시간대 매물을 찾을 수 없어요',
  /** 사유(멈춤·마감)·메모(다시 열기)가 빈칸(공백만 포함) */
  REASON_REQUIRED: '사유를 적어 주세요',
  /** 사유가 상한을 넘음(화면은 그 전에 입력을 멈춘다) */
  REASON_TOO_LONG: `사유는 ${ADMIN_REASON_LIMIT.toLocaleString('ko-KR')}자까지 쓸 수 있어요`,
  /** 이미 게시를 멈춘 샵 */
  ALREADY_PAUSED: '이미 새 매물 게시를 멈춘 샵이에요',
  /** 게시를 멈추지 않은 샵 */
  NOT_PAUSED: '새 매물 게시를 멈추지 않은 샵이에요',
  /** 손님이 결제 중(10분 홀딩)인 매물. 홀딩이 끝나면 다시 할 수 있다(#433) */
  SLOT_ON_HOLD: '손님이 결제 중인 매물이에요. 결제가 끝나거나 10분이 지난 뒤에 다시 해 주세요',
  /** 판매 전(게시예정·게시중)이 아닌 매물: 예약됨·마감·취소·완료 */
  SLOT_NOT_OPEN: '판매 전(게시예정·게시중) 매물만 마감할 수 있어요',
  /** 시간대 안에서 손님이 만든 칸. 시간대를 마감한다 */
  WINDOW_SLOT: '시간대 매물 안의 칸이에요. 그 시간대를 마감해 주세요',
  /** 이미 마감했거나 시간이 지난 시간대 */
  WINDOW_CLOSED: '이미 마감했거나 시간이 지난 시간대예요',
} as const;

export type AdminSlotErrorCode = keyof typeof ADMIN_SLOT_ERRORS;

export function adminSlotFail(code: AdminSlotErrorCode) {
  return fail(code, ADMIN_SLOT_ERRORS[code]);
}
