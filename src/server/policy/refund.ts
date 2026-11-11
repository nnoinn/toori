// 고객 취소 위약금 정책 (연결 #5, Issue #48 2장, X-202, C-305, C-402)과 합의 후 취소 환불율(X-208, #301).
// 환불액 계산은 src/server/refunds/calc-refund.ts(연결 #9, W7)가 이 값으로 한다. 환불 규정 문구도 이 값으로 만든다.

/**
 * 남은 시간별 위약금 비율(%). 위에서부터 보고, 남은 시간이 minHoursLeft 이상인 첫 구간을 쓴다.
 * 24시간 이상 30%(70% 환불), 6시간 이상 24시간 미만 50%, 6시간 미만 100%(환불 불가)
 */
export const REFUND_BANDS = [
  { minHoursLeft: 24, penaltyRate: 30 },
  { minHoursLeft: 6, penaltyRate: 50 },
  { minHoursLeft: 0, penaltyRate: 100 },
] as const;

/** 노쇼가 확정되면 6시간 미만 취소와 같게 위약금 100%(S-406) */
export const NO_SHOW_PENALTY_RATE = 100;

/**
 * 합의 후 취소(S-410·C-506·X-208, 11/8 결정) 손님 환불율(%). 손님은 실제 결제액 × 이 비율을 돌려받고(쓴 쿠폰은 돌려주지 않는다),
 * 원장님은 판매가 × (100 − 이 비율)%를 기준 금액으로 고객 취소 위약금과 같은 방식으로 정산받는다
 */
export const AGREED_CANCEL_REFUND_RATE = 50;

/** 합의 후 취소 요청에 손님이 답할 수 있는 시간(시간). 지나면 요청이 사라지고 예약은 그대로다 */
export const AGREED_CANCEL_RESPONSE_HOURS = 24;
