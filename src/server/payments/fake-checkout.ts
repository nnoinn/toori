// 가짜 결과 버전에서만 쓰는 것. 서버에서만 부른다. W11 ②(결제 확인)에서 지운다.
// 홀딩은 W10부터, 주문 저장은 W11 ①부터 진짜다. 여기에는 가짜 결제 확인에 필요한 것만 남았다.
// - 결제 번호·확정 결과를 DB 대신 httpOnly 쿠키 하나에 둔다. 누구의 값인지 사용자 id로 확인한다
// - 로컬(npm run dev)에서 .env.local에 DEV_FAKE_PAYMENT_FAILURE=<함수>:<코드>를 적으면 그 함수가 그 실패를 돌려준다
//   예: DEV_FAKE_PAYMENT_FAILURE=confirmPayment:AMOUNT_MISMATCH. 실패 화면 확인용이고 배포 주소에서는 꺼져 있다

import 'server-only';

import { cookies } from 'next/headers';
import { z } from 'zod';

import {
  AUTO_CANCEL_ERRORS,
  autoCancelFail,
  PAYMENT_ERRORS,
  type PaymentError,
  paymentFail,
} from './errors';

export const FAKE_CHECKOUT_COOKIE = 'fake_checkout';

/** 새로고침한 결과 화면을 보여줄 수 있게 하루 둔다 */
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 24 * 60 * 60,
} as const;

const stateSchema = z.object({
  userId: z.string(),
  slotId: z.string(),
  /** 이 매물에서 startPayment가 만든 결제 번호들(다시 결제하면 늘어난다) */
  paymentIds: z.array(z.string()),
  confirmed: z
    .object({ paymentId: z.string(), reservationId: z.string(), reservationCode: z.string() })
    .nullable(),
});

export type FakeCheckout = z.infer<typeof stateSchema>;

/** 지금 로그인한 사람의 값만. 없거나 모양이 틀리면 null */
export async function readFakeCheckout(userId: string): Promise<FakeCheckout | null> {
  const raw = (await cookies()).get(FAKE_CHECKOUT_COOKIE)?.value;
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const parsed = stateSchema.safeParse(value);
  return parsed.success && parsed.data.userId === userId ? parsed.data : null;
}

export async function writeFakeCheckout(state: FakeCheckout): Promise<void> {
  const value = Buffer.from(JSON.stringify(state)).toString('base64url');
  (await cookies()).set(FAKE_CHECKOUT_COOKIE, value, COOKIE_OPTIONS);
}

export async function clearFakeCheckout(): Promise<void> {
  (await cookies()).delete(FAKE_CHECKOUT_COOKIE);
}

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
    'HOLD_EXPIRED',
    'AMOUNT_MISMATCH',
    'SLOT_SOLD',
  ],
} as const satisfies Record<string, readonly string[]>;

/**
 * DEV_FAKE_PAYMENT_FAILURE가 이 함수를 가리키면 그 실패, 아니면 null. 로컬 개발(NODE_ENV=development)에서만 켜진다.
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
    console.warn(`[fake-checkout] ${fn}에서 흉내 낼 수 없는 실패 코드예요: ${code}`);
    return null;
  }
  if (fn === 'confirmPayment' && code in AUTO_CANCEL_ERRORS) {
    return autoCancelFail(code as keyof typeof AUTO_CANCEL_ERRORS);
  }
  const paymentCode = code as keyof typeof PAYMENT_ERRORS;
  if (paymentCode === 'ALREADY_HOLDING')
    return paymentFail(paymentCode, { heldSlotId: context.slotId });
  if (paymentCode === 'PAYMENT_CANCELLED' || paymentCode === 'PAYMENT_FAILED') {
    return paymentFail(paymentCode, {
      slotId: context.slotId,
      holdActive: context.holdActive ?? true,
    });
  }
  return paymentFail(paymentCode);
}
