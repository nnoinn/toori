// 쿠폰·원장님 귀책 취소 정책 (연결 #5, Issue #48 5장, X-207, C-407, S-409). 3단계 기능이라 값만 먼저 둔다.

/** 원장님 귀책 취소 때 고객 계정에 주는 쿠폰 금액(원). 비용은 투리가 부담한다 */
export const OWNER_FAULT_COUPON_AMOUNT = 3000;

/** 쿠폰 유효기간(일) */
export const COUPON_VALID_DAYS = 90;

/** 원장님 귀책 취소 패널티(원). 아직 지급하지 않은 정산금에서 먼저 뺀다 */
export const OWNER_FAULT_PENALTY_AMOUNT = 5000;
