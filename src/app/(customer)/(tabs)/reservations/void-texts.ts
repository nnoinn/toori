// 예약 무효(A-108) 손님 화면 표시(#528 제안, 11/21 정찬형). 내 예약 목록 카드와 예약 상세가 같이 쓴다.
// 무효는 원장님이 전액 환불에 동의해 운영자가 처리한 예약이다. 손님과 원장님 사이 분쟁이 있었던 경우라 이유("원장님 요청으로")는 적지 않는다.
// 문구는 무효 손님 알림(voidedCustomerBody, #423·11/17 nnoinn "사용하신")과 맞춘다

/** 상태 배지 옆 이름표. 탭은 상태대로 둔다(예정이었으면 취소 탭, 이용 완료였으면 이용 완료 탭) */
export const VOID_BADGE = '무효';

/** 무효 예약 상세 맨 위 안내. 무효는 실제 결제액 전부와 쓴 쿠폰을 돌려준다(VOID-02). 쿠폰으로 0원 결제했으면 금액은 말하지 않는다 */
export function voidedNote({ amount, couponAmount }: { amount: number; couponAmount: number }) {
  const sentences = ['이 예약은 무효로 처리됐어요.'];
  if (amount > 0) sentences.push('결제하신 금액을 모두 돌려드렸어요.');
  if (couponAmount > 0) {
    sentences.push(amount > 0 ? '사용하신 쿠폰도 돌려드렸어요.' : '사용하신 쿠폰을 돌려드렸어요.');
  }
  return sentences.join(' ');
}

/** 노쇼 배지·"환불되지 않아요" 안내를 보일지. 노쇼였어도 무효면 결제액을 모두 돌려받았으므로 숨긴다 */
export function showsNoShow({ noShow, voided }: { noShow: boolean; voided: boolean }) {
  return noShow && !voided;
}
