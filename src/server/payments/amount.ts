// 결제 금액 (X-201, C-407). 결제 시작(주문 저장)과 예약 확인 화면(getMyHold)이 같은 함수로 계산한다.
// 쿠폰(3단계, C-407)은 여기에 끼운다. 수수료·정산은 판매가 기준이라 쿠폰과 상관없다(정산 계산 #134).

/** 실제 결제액 = 판매가 − 쿠폰. 쿠폰이 판매가보다 크면 판매가까지만 뺀다 */
export function calcPaymentAmount(input: { salePrice: number; couponAmount?: number }): {
  salePrice: number;
  couponAmount: number;
  amount: number;
} {
  const { salePrice, couponAmount = 0 } = input;
  if (!Number.isInteger(salePrice) || salePrice <= 0) {
    throw new RangeError(`판매가가 올바르지 않아요: ${salePrice}`);
  }
  if (!Number.isInteger(couponAmount) || couponAmount < 0) {
    throw new RangeError(`쿠폰 금액이 올바르지 않아요: ${couponAmount}`);
  }
  const applied = Math.min(couponAmount, salePrice);
  return { salePrice, couponAmount: applied, amount: salePrice - applied };
}
