// 포트원 결제창 요청값과 결제 뒤 결과 화면 주소 (J11 2차, C-403, X-201). 화면에서 쓴다.
// 결제창을 여는 일(PortOne.requestPayment)은 checkout-view.tsx가 하고, 여기는 값을 만드는 순수 함수만 둔다.

import type { PaymentRequest as PortOnePaymentRequest } from '@portone/browser-sdk/v2';

import type { PaymentRequest } from '@/server/payments/types';

/**
 * 결제 수단. 토스페이먼츠(신모듈)는 결제창을 한 번 열 때 결제 수단 하나만 고른다. 지금은 카드만 쓴다.
 * 간편결제(C-403 "카드/간편결제")는 토스페이먼츠와 실제 계약을 한 뒤에 쓸 수 있고, 테스트 상점에서는 잘 되지 않는다
 * (포트원 토스페이먼츠 연동 안내). 계약 뒤 결제 수단 고르기와 함께 더한다
 */
export const CHECKOUT_PAY_METHOD = 'CARD';

/**
 * 결제 시작(startPayment)이 준 값에 결제 수단만 더한다. 금액·결제 번호·돌아올 주소는 서버 값 그대로 쓴다.
 * 결제창 모양은 포트원 기본값을 쓴다(토스페이먼츠는 PC는 화면 위 창, 폰은 결제 페이지로 이동만 된다)
 */
export function toPortOneRequest(request: PaymentRequest): PortOnePaymentRequest {
  return { ...request, payMethod: CHECKOUT_PAY_METHOD };
}

/**
 * PC에서 결제창이 닫힌 뒤 갈 결과 화면 주소. 폰은 포트원이 redirectUrl에 같은 값을 붙여 바로 보낸다.
 * 결제창이 알려 준 결과는 믿지 않고 결과 화면이 서버(confirmPayment)로 다시 확인한다.
 * 결제하지 않고 닫았거나 실패했으면 code·message도 넘긴다(홀딩이 남았으면 예약 확인으로 돌아가 다시 결제, D12)
 */
export function paymentResultPath(
  redirectUrl: string,
  result: { paymentId: string; code?: string; message?: string },
): string {
  const url = new URL(redirectUrl);
  url.searchParams.set('paymentId', result.paymentId);
  if (result.code) url.searchParams.set('code', result.code);
  if (result.message) url.searchParams.set('message', result.message);
  return `${url.pathname}${url.search}`;
}
