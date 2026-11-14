// 매물 시간 정책 (연결 #5, Issue #48 1장). 화면과 서버가 같이 쓴다.

import { hoursUntil } from '@/lib/time';

/** 서비스 시작 48시간 전부터 게시할 수 있다(S-204) */
export const PUBLISH_WINDOW_HOURS = 48;

/**
 * 원장님은 서비스 시작이 지금부터 14일 안인 매물까지 미리 올릴 수 있다(S-205, 11/3 nnoinn #23).
 * 시작 48시간 전(PUBLISH_WINDOW_HOURS)이 되기 전에는 게시예정으로 두고, 그때 저절로 게시중이 된다
 */
export const ADVANCE_LISTING_DAYS = 14;

/** 시작까지 6시간 미만이면 임박으로 강조한다(C-203) */
export const IMMINENT_WITHIN_HOURS = 6;

/** 시작까지 6시간 미만이면 환불 불가 뱃지·타이머를 보여준다(C-308). 위약금 100% 구간과 같다 */
export const NON_REFUNDABLE_WITHIN_HOURS = 6;

/** '예약하기'를 누르면 그 매물을 10분 동안 홀딩한다(C-404) */
export const HOLD_MINUTES = 10;

/** 결제 대기 주문을 포트원에 다시 물어 정리하기까지 기다리는 시간(C-406, W12 ②). 홀딩과 결제창 시간을 넉넉히 넘긴다 */
export const STALE_ORDER_MINUTES = 30;

/** 주문 정리 작업이 한 번에 처리하는 주문 수(W12 ②). 남은 주문은 다음 실행이 처리한다 */
export const ORDER_SWEEP_BATCH = 20;

/** 진행 중으로 남은 고객 취소를 정리 작업이 포트원에 물어 마무리하기까지 기다리는 시간(W14). 취소 요청 하나가 끝나는 시간(최대 60초)보다 충분히 길게 둔다 */
export const STALE_CANCEL_MINUTES = 5;

/** 매물 시작 시각 단위(3탭 ②). 시작 시각은 :00·:30처럼 이 단위로만 고른다(10/28 #108, #23 D10의 10분을 바꿈) */
export const SLOT_START_STEP_MINUTES = 30;

/** 메뉴 소요 시간 단위(O3). 40·50분 걸리는 서비스도 이 단위로 정한다(10/28 #108) */
export const MENU_DURATION_STEP_MINUTES = 30;

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
