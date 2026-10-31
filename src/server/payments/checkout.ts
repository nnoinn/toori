'use server';

// 예약·결제 (C-401~C-406, C-404, X-201, X-304, 연결 #8, #121). 매물 상세 '예약하기', 예약 확인 화면(/checkout/[slotId]),
// 결제 뒤 돌아오는 화면(/payment/result)에서 부른다(정찬형 J10·J11). 화면에서는 '@/server/payments/checkout'에서 가져온다.
//
// 모양(입력·결과·실패 코드)은 그대로 두고 속을 단계별로 바꾼다.
// - 진짜: 로그인·고객 모드, 10분 홀딩(W10, DB), 매물(게시중, 남의 홀딩, 신규 고객 전용, 판매가), 연락처, 입력 확인,
//   결제 시작의 주문 저장(W11 ①, 결제 대기 주문과 동의 2개의 버전·시각)
// - 아직 가짜(W11 ②에서 진짜): 결제 확인은 포트원에 묻지 않고 성공으로 보고, 예약을 만들지 않는다
//   (예약 id로 /reservations/…를 열면 없다). 실패 화면은 로컬에서 DEV_FAKE_PAYMENT_FAILURE로 흉내 낸다

import { headers } from 'next/headers';
import { z } from 'zod';

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { ok } from '@/lib/result';
import { requireCustomer } from '@/server/auth';
import { isNewCustomer } from '@/server/customers';

import { calcPaymentAmount } from './amount';
import { isMyActiveHold } from './checkout-rules';
import { readCheckoutSlot, readCustomerPhone } from './checkout-store';
import { autoCancelFail, type PaymentResult, paymentFail } from './errors';
import {
  clearFakeCheckout,
  devFakeFailure,
  readFakeCheckout,
  writeFakeCheckout,
} from './fake-checkout';
import { acquireHold, releaseMyHold } from './hold-store';
import { createPendingOrder, newPaymentId } from './order-store';
import { newReservationCode } from './reservation-code';
import type { ConfirmedReservation, HoldInfo, MyHold, PaymentRequest } from './types';

const slotIdSchema = z.uuid();

function holdInfo(slotId: string, holdExpiresAt: Date, now: Date): HoldInfo {
  return { slotId, holdExpiresAt: holdExpiresAt.toISOString(), serverNow: now.toISOString() };
}

/**
 * '예약하기'(C-404). 이 매물을 10분 홀딩한다. 한 사람은 동시에 1개만, 두 사람이 동시에 눌러도 한 명만.
 * 이미 내가 홀딩한 같은 매물이면 그 홀딩을 그대로 돌려준다(시간을 늘리지 않는다)
 */
export async function holdSlot(slotId: string): Promise<PaymentResult<HoldInfo>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  const id = slotIdSchema.safeParse(slotId);
  if (!id.success) return paymentFail('SLOT_NOT_AVAILABLE');
  const switched = devFakeFailure('holdSlot', { slotId: id.data });
  if (switched) return switched;

  const now = await getRequestNow();
  const outcome = await getDb().transaction((tx) =>
    acquireHold(tx, { slotId: id.data, customerId: auth.data.customerId, now }),
  );
  if (!outcome.ok) {
    return outcome.code === 'ALREADY_HOLDING'
      ? paymentFail('ALREADY_HOLDING', { heldSlotId: outcome.heldSlotId })
      : paymentFail(outcome.code);
  }
  return ok(holdInfo(id.data, outcome.holdExpiresAt, now));
}

/** 예약 확인 화면의 '취소'. 내 홀딩을 바로 푼다. 이미 풀렸거나 내 홀딩이 아니어도 성공(두 번 눌러도 된다) */
export async function releaseHold(slotId: string): Promise<PaymentResult<null>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  const id = slotIdSchema.safeParse(slotId);
  if (!id.success) return ok(null);

  await releaseMyHold(getDb(), { slotId: id.data, customerId: auth.data.customerId });
  const fake = await readFakeCheckout(auth.data.userId);
  if (fake && fake.confirmed === null && fake.slotId === id.data) await clearFakeCheckout();
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
  const slot = await readCheckoutSlot(id.data);
  if (!slot?.holdExpiresAt || !isMyActiveHold(slot, auth.data.customerId, now)) return ok(null);
  // 쿠폰은 3단계(C-407). 결제 시작과 같은 함수로 계산한다
  return ok({
    ...holdInfo(slot.slotId, slot.holdExpiresAt, now),
    ...calcPaymentAmount({ salePrice: slot.salePrice }),
  });
}

const startSchema = z.object({
  slotId: z.string(),
  refundPolicyAgreed: z.boolean(),
  bookerInfoAgreed: z.boolean(),
});

/**
 * '결제하기'(C-402·C-403). 결제 버튼 위 필수 동의 2개를 받고, 결제 대기 주문을 저장한 뒤 PortOne.requestPayment에 넣을 값을 돌려준다.
 * 같은 홀딩 안에서 다시 불러도 되고(결제창을 닫은 뒤, D12), 부를 때마다 새 결제 번호·새 주문을 만든다
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
  if (!slotIdSchema.safeParse(slotId).success) return paymentFail('NOT_HOLDER');

  const { userId, customerId } = auth.data;
  const now = await getRequestNow();
  const slot = await readCheckoutSlot(slotId);
  if (!slot || slot.holdCustomerId !== customerId) return paymentFail('NOT_HOLDER');
  if (!isMyActiveHold(slot, customerId, now)) return paymentFail('HOLD_EXPIRED');
  if (!(await readCustomerPhone(customerId))) return paymentFail('PHONE_REQUIRED');
  // 신규 고객 전용은 결제 직전에 다시 확인한다(그 사이 다른 예약으로 이력이 생겼을 수 있다)
  if (slot.newCustomerOnly && !(await isNewCustomer(customerId, slot.shopId))) {
    return paymentFail('NEW_CUSTOMER_ONLY');
  }
  const origin = (await headers()).get('origin');
  const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID;
  const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY;
  if (!origin || !storeId || !channelKey) {
    if (!storeId || !channelKey)
      console.error('[payments] 포트원 Store ID·채널 키가 없어요(.env.local)');
    return paymentFail('PAYMENT_UNAVAILABLE');
  }

  const amount = calcPaymentAmount({ salePrice: slot.salePrice });
  const paymentId = newPaymentId();
  await createPendingOrder(getDb(), { paymentId, slotId, customerId, ...amount, agreedAt: now });

  // 결제 확인은 ②까지 가짜라, 확인할 결제 번호를 쿠키에도 남긴다(②에서 지운다)
  const fake = await readFakeCheckout(userId);
  const sameSlot = fake && fake.slotId === slotId && fake.confirmed === null;
  await writeFakeCheckout({
    userId,
    slotId,
    paymentIds: [...(sameSlot ? fake.paymentIds : []), paymentId],
    confirmed: null,
  });
  return ok({
    storeId,
    channelKey,
    paymentId,
    orderName: `${slot.shopName} ${slot.menuName}`,
    totalAmount: amount.amount,
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
  const { userId, customerId } = auth.data;

  const now = await getRequestNow();
  const fake = await readFakeCheckout(userId);
  const slot = fake ? await readCheckoutSlot(fake.slotId) : null;
  const holdActive = slot !== null && isMyActiveHold(slot, customerId, now);
  const switched = devFakeFailure('confirmPayment', { slotId: fake?.slotId, holdActive });
  if (switched) return switched;

  if (!fake || !fake.paymentIds.includes(paymentId)) return paymentFail('PAYMENT_NOT_FOUND');
  if (fake.confirmed !== null) {
    if (fake.confirmed.paymentId !== paymentId) return paymentFail('PAYMENT_NOT_FOUND');
    const { reservationId, reservationCode } = fake.confirmed;
    return ok({ reservationId, reservationCode });
  }
  // 포트원이 code를 붙여 보내면 결제가 안 된 것이다. 고객이 닫은 것과 실패를 나누는 일은 W11에서 실제 코드를 보고 한다
  if (code) return paymentFail('PAYMENT_CANCELLED', { slotId: fake.slotId, holdActive });
  if (!holdActive) return autoCancelFail('HOLD_EXPIRED');

  // 가짜 확정: 예약을 만들지 않으므로 홀딩만 푼다(W11에서 예약 저장과 함께 '예약됨'으로 바꾼다)
  await releaseMyHold(getDb(), { slotId: fake.slotId, customerId });
  const confirmed = {
    paymentId,
    reservationId: crypto.randomUUID(),
    reservationCode: newReservationCode(),
  };
  await writeFakeCheckout({ ...fake, confirmed });
  return ok({ reservationId: confirmed.reservationId, reservationCode: confirmed.reservationCode });
}
