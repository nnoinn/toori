'use server';

// 예약·결제 (C-401~C-406, C-404, X-201, X-304, 연결 #8, #121). 매물 상세 '예약하기', 예약 확인 화면(/checkout/[slotId]),
// 결제 뒤 돌아오는 화면(/payment/result)에서 부른다(정찬형 J10·J11). 화면에서는 '@/server/payments/checkout'에서 가져온다.
//
// **지금은 가짜 결과 버전(W9)이다.** 모양(입력·결과·실패 코드)은 그대로 두고 속만 W10(홀딩)·W11(결제)에서 바꾼다.
// - 진짜: 로그인·고객 모드, 매물(게시중인지, DB에 남의 홀딩이 있는지, 신규 고객 전용, 판매가), 연락처, 입력 확인
// - 가짜: 홀딩을 DB 대신 쿠키에 둔다(목록에 '다른 고객이 결제 중'이 안 뜬다). 결제는 포트원을 부르지 않고 성공으로 보고,
//   주문·예약을 만들지 않는다(예약 id로 /reservations/…를 열면 없다). 실패 화면은 DEV_FAKE_PAYMENT_FAILURE로 흉내 낸다

import { headers } from 'next/headers';
import { z } from 'zod';

import { getRequestNow } from '@/lib/request-time';
import { ok } from '@/lib/result';
import { requireCustomer } from '@/server/auth';
import { isNewCustomer } from '@/server/customers';
import { HOLD_MINUTES } from '@/server/policy';

import { holdBlockReason } from './checkout-rules';
import { readCheckoutSlot, readCustomerPhone } from './checkout-store';
import { autoCancelFail, type PaymentResult, paymentFail } from './errors';
import {
  clearFakeCheckout,
  devFakeFailure,
  isFakeHoldActive,
  newFakePaymentId,
  readFakeCheckout,
  writeFakeCheckout,
} from './fake-checkout';
import { newReservationCode } from './reservation-code';
import type { ConfirmedReservation, HoldInfo, MyHold, PaymentRequest } from './types';

const slotIdSchema = z.uuid();

function holdInfo(slotId: string, holdExpiresAt: string, now: Date): HoldInfo {
  return { slotId, holdExpiresAt, serverNow: now.toISOString() };
}

/**
 * '예약하기'(C-404). 이 매물을 10분 홀딩한다. 한 사람은 동시에 1개만.
 * 이미 내가 홀딩한 같은 매물이면 그 홀딩을 그대로 돌려준다(시간을 늘리지 않는다)
 */
export async function holdSlot(slotId: string): Promise<PaymentResult<HoldInfo>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  const id = slotIdSchema.safeParse(slotId);
  if (!id.success) return paymentFail('SLOT_NOT_AVAILABLE');
  const switched = devFakeFailure('holdSlot', { slotId: id.data });
  if (switched) return switched;

  const { userId, customerId } = auth.data;
  const now = await getRequestNow();
  const current = await readFakeCheckout(userId);
  if (current && isFakeHoldActive(current, now)) {
    if (current.slotId !== id.data) {
      return paymentFail('ALREADY_HOLDING', { heldSlotId: current.slotId });
    }
    return ok(holdInfo(current.slotId, current.holdExpiresAt, now));
  }

  const slot = await readCheckoutSlot(id.data);
  if (!slot) return paymentFail('SLOT_NOT_AVAILABLE');
  const blocked = holdBlockReason(slot, customerId, now);
  if (blocked) return paymentFail(blocked);
  if (slot.newCustomerOnly && !(await isNewCustomer(customerId, slot.shopId))) {
    return paymentFail('NEW_CUSTOMER_ONLY');
  }

  const holdExpiresAt = new Date(now.getTime() + HOLD_MINUTES * 60 * 1000).toISOString();
  await writeFakeCheckout({
    userId,
    slotId: slot.slotId,
    holdExpiresAt,
    paymentIds: [],
    confirmed: null,
  });
  return ok(holdInfo(slot.slotId, holdExpiresAt, now));
}

/** 예약 확인 화면의 '취소'. 내 홀딩을 바로 푼다. 이미 풀렸거나 내 홀딩이 아니어도 성공(두 번 눌러도 된다) */
export async function releaseHold(slotId: string): Promise<PaymentResult<null>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  const current = await readFakeCheckout(auth.data.userId);
  if (current && current.confirmed === null && current.slotId === slotId) {
    await clearFakeCheckout();
  }
  return ok(null);
}

/**
 * 예약 확인 화면(서버 렌더링)이 내 홀딩과 결제 금액을 읽는다. 내 홀딩이 아니거나 끝났으면 null(상세로 돌려보낸다).
 * 읽기만 하므로 Server Component에서 불러도 된다(<Suspense> 안)
 */
export async function getMyHold(slotId: string): Promise<PaymentResult<MyHold | null>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  const id = slotIdSchema.safeParse(slotId);
  if (!id.success) return ok(null);

  const now = await getRequestNow();
  const current = await readFakeCheckout(auth.data.userId);
  if (!current || current.slotId !== id.data || !isFakeHoldActive(current, now)) return ok(null);
  const slot = await readCheckoutSlot(id.data);
  if (!slot) return ok(null);
  // 쿠폰은 3단계(C-407). 결제 금액 계산은 W11에서 함수 하나로 모은다
  const couponAmount = 0;
  return ok({
    ...holdInfo(slot.slotId, current.holdExpiresAt, now),
    salePrice: slot.salePrice,
    couponAmount,
    amount: slot.salePrice - couponAmount,
  });
}

const startSchema = z.object({
  slotId: z.string(),
  refundPolicyAgreed: z.boolean(),
  bookerInfoAgreed: z.boolean(),
});

/**
 * '결제하기'(C-402·C-403). 결제 버튼 위 필수 동의 2개를 받고, PortOne.requestPayment에 넣을 값을 돌려준다.
 * 같은 홀딩 안에서 다시 불러도 되고(결제창을 닫은 뒤, D12), 부를 때마다 새 결제 번호를 만든다
 */
export async function startPayment(input: {
  slotId: string;
  refundPolicyAgreed: true;
  bookerInfoAgreed: true;
}): Promise<PaymentResult<PaymentRequest>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return paymentFail('INVALID_INPUT');
  const { slotId, refundPolicyAgreed, bookerInfoAgreed } = parsed.data;
  if (!refundPolicyAgreed || !bookerInfoAgreed) return paymentFail('CONSENT_REQUIRED');
  const switched = devFakeFailure('startPayment', { slotId });
  if (switched) return switched;

  const { userId, customerId } = auth.data;
  const now = await getRequestNow();
  const current = await readFakeCheckout(userId);
  if (!current || current.slotId !== slotId || current.confirmed !== null) {
    return paymentFail('NOT_HOLDER');
  }
  if (!isFakeHoldActive(current, now)) return paymentFail('HOLD_EXPIRED');
  if (!(await readCustomerPhone(customerId))) return paymentFail('PHONE_REQUIRED');
  const slot = await readCheckoutSlot(slotId);
  if (!slot) return paymentFail('SLOT_NOT_AVAILABLE');
  // 신규 고객 전용은 결제 직전에 다시 확인한다(그 사이 다른 예약으로 이력이 생겼을 수 있다)
  if (slot.newCustomerOnly && !(await isNewCustomer(customerId, slot.shopId))) {
    return paymentFail('NEW_CUSTOMER_ONLY');
  }
  const origin = (await headers()).get('origin');
  if (!origin) return paymentFail('PAYMENT_UNAVAILABLE');

  const paymentId = newFakePaymentId();
  await writeFakeCheckout({ ...current, paymentIds: [...current.paymentIds, paymentId] });
  return ok({
    storeId: process.env.NEXT_PUBLIC_PORTONE_STORE_ID || 'fake-store',
    channelKey: process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY || 'fake-channel',
    paymentId,
    orderName: `${slot.shopName} ${slot.menuName}`,
    totalAmount: slot.salePrice,
    currency: 'CURRENCY_KRW',
    redirectUrl: `${origin}/payment/result`,
  });
}

const confirmSchema = z.object({
  paymentId: z.string().min(1).max(200),
  code: z.string().optional(),
  message: z.string().optional(),
});

/**
 * 결제 뒤 돌아온 화면(/payment/result)에서 부른다. 복귀 주소의 paymentId(실패하면 code·message도)를 그대로 넘긴다.
 * 성공하면 예약이 확정된다. 새로고침으로 다시 불러도 같은 결과다.
 * 화면이 열린 뒤 'use client' 컴포넌트에서 한 번 부른다(서버 렌더링 중에는 부르지 않는다)
 */
export async function confirmPayment(input: {
  paymentId: string;
  code?: string;
  message?: string;
}): Promise<PaymentResult<ConfirmedReservation>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return paymentFail('PAYMENT_NOT_FOUND');
  const { paymentId, code } = parsed.data;

  const now = await getRequestNow();
  const current = await readFakeCheckout(auth.data.userId);
  const holdActive = current !== null && isFakeHoldActive(current, now);
  const switched = devFakeFailure('confirmPayment', { slotId: current?.slotId, holdActive });
  if (switched) return switched;

  if (!current || !current.paymentIds.includes(paymentId)) return paymentFail('PAYMENT_NOT_FOUND');
  if (current.confirmed !== null) {
    if (current.confirmed.paymentId !== paymentId) return paymentFail('PAYMENT_NOT_FOUND');
    const { reservationId, reservationCode } = current.confirmed;
    return ok({ reservationId, reservationCode });
  }
  // 포트원이 code를 붙여 보내면 결제가 안 된 것이다. 고객이 닫은 것과 실패를 나누는 일은 W11에서 실제 코드를 보고 한다
  if (code) return paymentFail('PAYMENT_CANCELLED', { slotId: current.slotId, holdActive });
  if (!holdActive) return autoCancelFail('HOLD_EXPIRED');

  const confirmed = {
    paymentId,
    reservationId: crypto.randomUUID(),
    reservationCode: newReservationCode(),
  };
  await writeFakeCheckout({ ...current, confirmed });
  return ok({ reservationId: confirmed.reservationId, reservationCode: confirmed.reservationCode });
}
