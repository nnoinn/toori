// 실패 화면 확인용 스위치. 서버에서만 부른다. 로컬 개발(NODE_ENV=development)에서만 켜지고 배포 주소와 테스트에서는 꺼져 있다.
// .env.local에 DEV_FAKE_PAYMENT_FAILURE=<함수>:<코드>를 적으면 그 함수가 그 실패를 돌려준다.
// 예: DEV_FAKE_PAYMENT_FAILURE=confirmPayment:AMOUNT_MISMATCH. 진짜 결제로는 만들기 어려운 실패(금액 불일치 등) 화면을 볼 때 쓴다

import 'server-only';

import {
  PAYMENT_ERRORS,
  type PaymentError,
  paymentFail,
  UNCONFIRMED_ERRORS,
  unconfirmedFail,
} from './errors';

/** 함수마다 스위치로 흉내 낼 수 있는 실패 코드 */
const SWITCHABLE = {
  holdSlot: ['SLOT_NOT_AVAILABLE', 'HELD_BY_OTHER', 'ALREADY_HOLDING', 'NEW_CUSTOMER_ONLY'],
  startPayment: [
    'SLOT_NOT_AVAILABLE',
    'NOT_HOLDER',
    'HOLD_EXPIRED',
    'PHONE_REQUIRED',
    'NEW_CUSTOMER_ONLY',
    'PAYMENT_UNAVAILABLE',
  ],
  confirmPayment: [
    'PAYMENT_CANCELLED',
    'PAYMENT_FAILED',
    'PAYMENT_NOT_FOUND',
    'PAYMENT_PENDING',
    'PAYMENT_CHECK_UNAVAILABLE',
    'HOLD_EXPIRED',
    'AMOUNT_MISMATCH',
    'SLOT_SOLD',
  ],
} as const satisfies Record<string, readonly string[]>;

/**
 * DEV_FAKE_PAYMENT_FAILURE가 이 함수를 가리키면 그 실패, 아니면 null.
 * context는 실패에 붙여 줄 값(결제하려던 매물, 홀딩이 남았는지)
 */
export function devFakeFailure(
  fn: keyof typeof SWITCHABLE,
  context: { slotId?: string; holdActive?: boolean } = {},
): { ok: false; error: PaymentError } | null {
  if (process.env.NODE_ENV !== 'development') return null;
  const [target, code] = (process.env.DEV_FAKE_PAYMENT_FAILURE ?? '').split(':');
  if (target !== fn) return null;
  if (!(SWITCHABLE[fn] as readonly string[]).includes(code)) {
    console.warn(`[dev-fake-failure] ${fn}에서 흉내 낼 수 없는 실패 코드예요: ${code}`);
    return null;
  }
  // 결제는 됐는데 확정할 수 없는 경우는 진짜와 같은 모양으로(W11: 기록만, autoCancelled false)
  if (fn === 'confirmPayment' && code in UNCONFIRMED_ERRORS) {
    return unconfirmedFail(code as keyof typeof UNCONFIRMED_ERRORS);
  }
  const paymentCode = code as keyof typeof PAYMENT_ERRORS;
  if (paymentCode === 'ALREADY_HOLDING') {
    return paymentFail(paymentCode, { heldSlotId: context.slotId });
  }
  if (paymentCode === 'PAYMENT_CANCELLED' || paymentCode === 'PAYMENT_FAILED') {
    return paymentFail(paymentCode, {
      slotId: context.slotId,
      holdActive: context.holdActive ?? true,
    });
  }
  return paymentFail(paymentCode);
}
