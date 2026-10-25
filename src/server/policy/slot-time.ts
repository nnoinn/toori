// 매물 시간 정책 (연결 #5, Issue #48 1장). 화면과 서버가 같이 쓴다.

import { hoursUntil } from '@/lib/time';

/** 서비스 시작 48시간 전부터 게시할 수 있다(S-204) */
export const PUBLISH_WINDOW_HOURS = 48;

/** 시작까지 6시간 미만이면 임박으로 강조한다(C-203) */
export const IMMINENT_WITHIN_HOURS = 6;

/** 시작까지 6시간 미만이면 환불 불가 뱃지·타이머를 보여준다(C-308). 위약금 100% 구간과 같다 */
export const NON_REFUNDABLE_WITHIN_HOURS = 6;

/** '예약하기'를 누르면 그 매물을 10분 동안 홀딩한다(C-404) */
export const HOLD_MINUTES = 10;

/** 매물 시작 시각을 고르는 간격(3탭 ②, 정민석 #23 D10) */
export const SLOT_START_STEP_MINUTES = 10;

/**
 * 카드 배지·상세 강조(C-203, C-308). 서버가 서버 시각(now)으로 정해서 화면에 넘긴다.
 * 남은 시간이 기준 미만이면 true다. 예: 딱 6시간 남았으면 false, 5시간 59분이면 true
 */
export function getSlotTimeFlags(
  startAt: Date,
  now: Date,
): { imminent: boolean; nonRefundable: boolean } {
  const hoursLeft = hoursUntil(startAt, now);
  return {
    imminent: hoursLeft < IMMINENT_WITHIN_HOURS,
    nonRefundable: hoursLeft < NON_REFUNDABLE_WITHIN_HOURS,
  };
}
