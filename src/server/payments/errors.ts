// 예약·결제 함수의 실패 코드와 화면 문구 (연결 #8, #121). 화면은 error.message를 그대로 보여주고, 코드로 다음 행동을 고른다.
// 화면과 서버 어디서나 가져올 수 있다.

import type { ResultError } from '@/lib/result';
import { HOLD_MINUTES } from '@/server/policy/slot-time';

const REFUNDED = '결제한 금액은 모두 환불돼요';

export const PAYMENT_ERRORS = {
  INVALID_INPUT: '입력한 내용을 다시 확인해 주세요',
  /** 판매됨·마감·시작 지남·게시 전·없는 매물 */
  SLOT_NOT_AVAILABLE: '지금은 예약할 수 없는 매물이에요',
  HELD_BY_OTHER: '다른 고객이 결제 중이에요. 잠시 후 다시 확인해 주세요',
  ALREADY_HOLDING:
    '결제 중인 다른 매물이 있어요. 그 매물을 결제하거나 취소한 뒤 다시 시도해 주세요',
  NEW_CUSTOMER_ONLY: '이 샵을 처음 이용하는 고객만 예약할 수 있는 매물이에요',
  CONSENT_REQUIRED: '필수 항목에 모두 동의해 주세요',
  /** 이 매물을 홀딩한 적이 없거나 이미 풀었다 */
  NOT_HOLDER: '결제할 수 있는 상태가 아니에요. 매물 화면에서 예약하기를 다시 눌러 주세요',
  HOLD_EXPIRED: `결제 가능 시간(${HOLD_MINUTES}분)이 지났어요. 매물 화면에서 다시 예약해 주세요`,
  PHONE_REQUIRED: '예약하려면 휴대폰 번호를 먼저 입력해 주세요',
  PAYMENT_UNAVAILABLE: '결제를 준비하지 못했어요. 잠시 후 다시 시도해 주세요',
  PAYMENT_CANCELLED: '결제가 취소됐어요',
  PAYMENT_FAILED: '결제하지 못했어요. 다시 시도해 주세요',
  PAYMENT_NOT_FOUND: '결제 정보를 찾을 수 없어요',
} as const;

/** 결제는 됐지만 확정할 수 없어서 자동 취소했을 때(C-406). confirmPayment만 돌려준다 */
export const AUTO_CANCEL_ERRORS = {
  HOLD_EXPIRED: `결제 가능 시간(${HOLD_MINUTES}분)이 지나서 결제를 취소했어요. ${REFUNDED}`,
  AMOUNT_MISMATCH: `결제 금액이 달라서 결제를 취소했어요. ${REFUNDED}`,
  SLOT_SOLD: `그 사이 매물이 판매되어 결제를 취소했어요. ${REFUNDED}`,
} as const;

export type PaymentErrorCode = keyof typeof PAYMENT_ERRORS | keyof typeof AUTO_CANCEL_ERRORS;

/** 실패에 더 붙는 값. 해당 코드에서만 온다 */
export type PaymentError = ResultError & {
  /** ALREADY_HOLDING: 지금 홀딩 중인 매물("그 매물로 가기") */
  heldSlotId?: string;
  /** PAYMENT_CANCELLED·PAYMENT_FAILED: 결제하려던 매물 */
  slotId?: string;
  /** PAYMENT_CANCELLED·PAYMENT_FAILED: 홀딩이 남았으면 예약 확인 화면으로 돌아가 다시 결제(D12) */
  holdActive?: boolean;
  /** confirmPayment의 HOLD_EXPIRED·AMOUNT_MISMATCH·SLOT_SOLD: 결제를 자동 취소했으면 true */
  autoCancelled?: boolean;
};

export type PaymentResult<T> = { ok: true; data: T } | { ok: false; error: PaymentError };

export function paymentFail(
  code: keyof typeof PAYMENT_ERRORS,
  extra: Omit<PaymentError, 'code' | 'message'> = {},
): { ok: false; error: PaymentError } {
  return { ok: false, error: { code, message: PAYMENT_ERRORS[code], ...extra } };
}

export function autoCancelFail(code: keyof typeof AUTO_CANCEL_ERRORS): {
  ok: false;
  error: PaymentError;
} {
  return { ok: false, error: { code, message: AUTO_CANCEL_ERRORS[code], autoCancelled: true } };
}
