// 예약·결제 함수가 돌려주는 값 (연결 #8, #121). 시각은 ISO 문자열이다(Countdown의 targetAt·serverNow에 그대로).
// 화면과 서버 어디서나 가져올 수 있다.

/** holdSlot 결과. 타이머는 holdExpiresAt과 serverNow로 계산한다(서버 시각 기준) */
export type HoldInfo = {
  slotId: string;
  holdExpiresAt: string;
  serverNow: string;
};

/** getMyHold 결과(예약 확인 화면). 금액은 서버가 계산한다. 쿠폰은 3단계(C-407)라 지금은 0 */
export type MyHold = HoldInfo & {
  salePrice: number;
  couponAmount: number;
  /** 실제 결제액 = 판매가 − 쿠폰 */
  amount: number;
};

/** startPayment 결과. PortOne.requestPayment에 그대로 넣는다. 결제창 값이 더 필요하면 W11에서 칸을 더한다 */
export type PaymentRequest = {
  storeId: string;
  channelKey: string;
  paymentId: string;
  orderName: string;
  totalAmount: number;
  currency: 'CURRENCY_KRW';
  /** 결제 뒤 돌아오는 화면(/payment/result). 포트원이 paymentId(실패하면 code·message도)를 붙인다 */
  redirectUrl: string;
};

/** confirmPayment 결과. 결제 완료 화면은 예약 상세(/reservations/[reservationId])로 연결한다(10/28 결정) */
export type ConfirmedReservation = {
  reservationId: string;
  /** 예약번호 8자리(화면 표시용) */
  reservationCode: string;
};
