// 쿠폰·원장님 귀책 취소 정책 (연결 #5, Issue #48 5장, X-207, C-407, S-409). 쿠폰 적용(C-407, #300)은 MIN_PAYMENT_AMOUNT를 쓴다.

/** 원장님 귀책 취소 때 고객 계정에 주는 쿠폰 금액(원). 비용은 투리가 부담한다 */
export const OWNER_FAULT_COUPON_AMOUNT = 3000;

/** 쿠폰 유효기간(일) */
export const COUPON_VALID_DAYS = 90;

/** 원장님 귀책 취소 패널티(원). 아직 지급하지 않은 정산금에서 먼저 뺀다 */
export const OWNER_FAULT_PENALTY_AMOUNT = 5000;

/**
 * 쿠폰을 뺀 결제액의 최소 금액(원, C-407 #300). 이보다 작아지는 매물에는 쿠폰을 쓸 수 없다.
 * 토스페이먼츠는 신용카드 100원, 계좌 200원부터 결제를 받는다(오류 코드 BELOW_MINIMUM_AMOUNT). 결제창에서 간편결제(계좌)도 고를 수 있어서 큰 값으로 둔다(11/11)
 */
export const MIN_PAYMENT_AMOUNT = 200;
