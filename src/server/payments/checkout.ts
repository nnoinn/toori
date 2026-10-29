'use server';

// 예약·결제 (C-401~C-406, C-404, X-201, X-304, 연결 #8, #121). 매물 상세 '예약하기', 예약 확인 화면(/checkout/[slotId]),
// 결제 뒤 돌아오는 화면(/payment/result)에서 부른다(정찬형 J10·J11). 화면에서는 '@/server/payments/checkout'에서 가져온다.
//
// 모두 진짜다: 10분 홀딩(W10), 결제 대기 주문(W11 ①), 포트원 결제 조회와 예약 확정(W11 ②).
// 결제는 됐는데 확정할 수 없는 경우(홀딩 시간이 지난 뒤 결제, 금액 다름, 팔림)는 주문에 기록만 하고(autoCancelled: false),
// 포트원 자동 취소는 W12에서 붙인다. 진짜 결제로 만들기 어려운 실패 화면은 로컬에서 DEV_FAKE_PAYMENT_FAILURE로 흉내 낸다

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
import { confirmPaidOrder, type MyOrder, readMyOrder, recordOrderOutcome } from './confirm-store';
import { devFakeFailure } from './dev-fake-failure';
import { type PaymentResult, paymentFail, unconfirmedFail } from './errors';
import { acquireHold, releaseMyHold } from './hold-store';
import { createPendingOrder, newPaymentId } from './order-store';
import { getPortOnePayment } from './portone';
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

  const { customerId } = auth.data;
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
 * 브라우저가 보낸 결과는 믿지 않고 포트원에 결제를 물어본 뒤, 결제 완료·금액이 맞으면 예약을 확정한다.
 * 새로고침으로 다시 불러도 같은 결과다. 화면이 열린 뒤 'use client' 컴포넌트에서 한 번 부른다(서버 렌더링 중에는 부르지 않는다)
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
  const { customerId } = auth.data;

  const db = getDb();
  const order = await readMyOrder(db, paymentId, customerId);
  const now = await getRequestNow();
  /** 결제가 안 됐을 때 예약 확인 화면으로 돌아가 다시 결제할 수 있는지(D12) */
  const notPaid = async (failure: 'PAYMENT_CANCELLED' | 'PAYMENT_FAILED') => {
    const slot = order ? await readCheckoutSlot(order.slotId) : null;
    const holdActive = slot !== null && isMyActiveHold(slot, customerId, now);
    return paymentFail(failure, { slotId: order?.slotId, holdActive });
  };

  const switched = devFakeFailure('confirmPayment', { slotId: order?.slotId, holdActive: true });
  if (switched) return switched;
  if (!order) return paymentFail('PAYMENT_NOT_FOUND');

  // 이미 결과가 정해진 주문(새로고침, 웹훅이 먼저 처리)
  const settled = settledResult(order);
  if (settled === 'not_paid')
    return notPaid(order.pgStatus === 'FAILED' ? 'PAYMENT_FAILED' : 'PAYMENT_CANCELLED');
  if (settled) return settled;

  const lookup = await getPortOnePayment(paymentId);
  if (!lookup.ok) {
    // not_found: 결제창까지 가지 않았다(결제창을 열기 전에 닫음 등). 주문은 결제 대기로 둔다
    return lookup.reason === 'not_found'
      ? notPaid('PAYMENT_CANCELLED')
      : paymentFail('PAYMENT_CHECK_UNAVAILABLE');
  }
  const payment = lookup.payment;
  switch (payment.status) {
    case 'PAID':
      break;
    case 'READY':
      // 결제창에서 결제하지 않고 돌아왔다(code가 붙어 옴). code가 없으면 아직 진행 중으로 본다
      return code ? notPaid('PAYMENT_CANCELLED') : paymentFail('PAYMENT_PENDING');
    case 'PENDING':
    case 'VIRTUAL_ACCOUNT_ISSUED':
      return paymentFail('PAYMENT_PENDING');
    case 'FAILED':
    case 'CANCELLED':
    case 'PARTIAL_CANCELLED':
      await recordOrderOutcome(db, order.orderId, {
        status: 'failed',
        pgStatus: payment.status,
        failureCode: payment.status,
        failureMessage: payment.failureReason,
      });
      return notPaid(payment.status === 'FAILED' ? 'PAYMENT_FAILED' : 'PAYMENT_CANCELLED');
    default:
      console.error('[payments] 알 수 없는 포트원 결제 상태:', payment.status);
      return paymentFail('PAYMENT_CHECK_UNAVAILABLE');
  }

  if (payment.amountTotal !== order.amount || (payment.currency && payment.currency !== 'KRW')) {
    console.error('[payments] 결제 금액이 주문과 달라요:', order.orderId);
    await recordOrderOutcome(db, order.orderId, {
      status: 'paid',
      pgStatus: payment.status,
      payMethod: payment.method,
      paidAt: payment.paidAt,
      failureCode: 'AMOUNT_MISMATCH',
    });
    return unconfirmedFail('AMOUNT_MISMATCH');
  }

  const confirmed = await db.transaction((tx) =>
    confirmPaidOrder(tx, {
      orderId: order.orderId,
      pgStatus: payment.status,
      payMethod: payment.method,
      // 결제 시각이 없으면(포트원 응답 모양이 다를 때) 지금으로 본다
      paidAt: payment.paidAt ?? now,
    }),
  );
  if (!confirmed.ok) return unconfirmedFail(confirmed.code);
  return ok({ reservationId: confirmed.reservationId, reservationCode: confirmed.reservationCode });
}

/** 결과가 이미 정해진 주문의 답. 결제 대기면 null(포트원에 물어본다) */
function settledResult(order: MyOrder): PaymentResult<ConfirmedReservation> | 'not_paid' | null {
  switch (order.status) {
    case 'confirmed':
      return order.reservation ? ok(order.reservation) : null;
    case 'paid':
    case 'auto_cancelled': {
      const code = order.failureCode;
      return code === 'HOLD_EXPIRED' || code === 'AMOUNT_MISMATCH' || code === 'SLOT_SOLD'
        ? unconfirmedFail(code)
        : unconfirmedFail('SLOT_SOLD');
    }
    case 'failed':
      return 'not_paid';
    default:
      return null;
  }
}
