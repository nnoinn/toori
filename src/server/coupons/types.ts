// 쿠폰 조회가 돌려주는 값 (C-407, 연결 #17, #300). 시각은 ISO 문자열이다. 화면과 서버 어디서나 가져올 수 있다.

/** 쿠폰 한 장 */
export type MyCoupon = {
  couponId: string;
  /** 할인 금액(원) */
  amount: number;
  /** 이 시각부터 쓸 수 없다 */
  expiresAt: string;
  /**
   * 이 매물에 쓸 수 있는지. false면 쿠폰을 빼면 최소 결제 금액(MIN_PAYMENT_AMOUNT)보다 작아지는 매물이다(목록에 이유를 보여준다).
   * 매물 없이(내 정보) 부르면 모두 true
   */
  applicable: boolean;
};

/** getMyCoupons 결과 */
export type MyCoupons = {
  /**
   * 매물을 넘기면: 쓸 수 있는 쿠폰을 할인 큰 순(같으면 기한 빠른 순)으로 먼저, 못 쓰는 쿠폰은 뒤에.
   * 매물 없이(내 정보 "쿠폰 N장 · 가장 빠른 기한"): 기한 빠른 순
   */
  coupons: MyCoupon[];
  /** 예약 확인 화면을 열 때 골라 둘 쿠폰(11/10 #300 Q1). 쓸 수 있는 쿠폰이 없거나 매물 없이 부르면 null */
  defaultCouponId: string | null;
};
