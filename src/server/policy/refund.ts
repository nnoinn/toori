// 고객 취소 위약금 정책 (연결 #5, Issue #48 2장, X-202, C-305, C-402).
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
