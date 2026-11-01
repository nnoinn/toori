// 예약·결제 (연결 #8, #121). 서버 코드용. 예: import { readCheckoutSlot } from '@/server/payments';
// 화면('use client')에서 쓰는 것은 여기 말고 파일에서 직접 가져온다(이 파일은 server-only 파일을 같이 내보내서 화면에서 가져올 수 없다).
// - 홀딩·결제 함수(holdSlot, releaseHold, getMyHold, startPayment, confirmPayment): '@/server/payments/checkout'
// - 결과·실패 모양(HoldInfo, MyHold, PaymentRequest, ConfirmedReservation, PaymentError): '@/server/payments/types', '@/server/payments/errors'

export { calcPaymentAmount } from './amount';
export { holdBlockReason } from './checkout-rules';
export { type CheckoutSlot, readCheckoutSlot, readCustomerPhone } from './checkout-store';
export {
  type ConfirmOutcome,
  confirmPaidOrder,
  type MyOrder,
  type OrderOutcome,
  readMyOrder,
  recordOrderOutcome,
} from './confirm-store';
export {
  AUTO_CANCEL_ERRORS,
  PAYMENT_ERRORS,
  type PaymentError,
  type PaymentErrorCode,
  type PaymentResult,
  UNCONFIRMED_ERRORS,
  type UnconfirmedCode,
} from './errors';
export { createPendingOrder, type NewPendingOrder, newPaymentId } from './order-store';
export { getPortOnePayment, type PortOneLookup, type PortOnePayment } from './portone';
export { newReservationCode, RESERVATION_CODE_PATTERN } from './reservation-code';
export type { ConfirmedReservation, HoldInfo, MyHold, PaymentRequest } from './types';
