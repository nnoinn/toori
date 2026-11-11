'use server';

// 합의 후 취소 (S-410·C-506·X-208, 연결 #19, #301). 원장님 예약 상세의 [예약 취소] → "손님과 합의 후 취소"(정민석 S-410)와
// 고객 내 예약 상세의 요청 카드(정찬형 C-506)에서 부른다. 화면에서는 '@/server/refunds/agreed-cancel'에서 가져온다.
//
// 지금은 가짜 결과 버전이다(#301 모양 그대로). 로그인과 내 예약·내 샵 예약인지는 진짜로 확인하고,
// 요청 상태는 로컬 스위치(DEV_FAKE_AGREED_CANCEL, agreed-cancel-fake.ts)로 흉내 내며, 요청·답하기는 저장하지 않고 결과만 돌려준다.
// 금액(손님 환불 = 결제액 × 50%, 원장님 기준 금액 = 판매가 × 50%)과 문구·실패 코드는 진짜와 같다.
// 진짜 버전은 #320(요청 표) 승인 → 마이그레이션 → X-208 처리(환불·취소·정산 줄·알림·24시간 만료)에서 같은 모양으로 바꾼다.

import { z } from 'zod';

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { ok } from '@/lib/result';
import { requireCustomer, requireOwner } from '@/server/auth';
import { AGREED_CANCEL_RESPONSE_HOURS } from '@/server/policy/refund';

import { type AgreedCancelResult, agreedCancelFail } from './agreed-cancel-errors';
import {
  fakeAgreedCancelFailure,
  fakeAgreedCancelRequest,
  fakeAgreedCancelStatus,
} from './agreed-cancel-fake';
import { calcAgreedCancel, isAgreedCancelTarget } from './agreed-cancel-rules';
import { readAgreedCancelTarget } from './agreed-cancel-store';
import {
  AGREED_CANCEL_REASON_TEXT_MAX,
  AGREED_CANCEL_REASONS,
  type AgreedCancelResponse,
  type AgreedCancelStatusView,
  type PendingAgreedCancel,
  type RequestedAgreedCancel,
} from './agreed-cancel-types';

const idSchema = z.uuid();
const HOUR_MS = 60 * 60 * 1000;

/** 원장님 예약 상세(S-410): 그 예약의 합의 후 취소 상태와 요청할 수 있는지. 내 샵 예약만 */
export async function getAgreedCancelStatus(
  reservationId: string,
): Promise<AgreedCancelResult<AgreedCancelStatusView>> {
  const auth = await requireOwner();
  if (!auth.ok) return auth;
  if (!idSchema.safeParse(reservationId).success) return agreedCancelFail('RESERVATION_NOT_FOUND');
  const target = await readAgreedCancelTarget(getDb(), reservationId);
  if (!target || target.shopId !== auth.data.shopId) {
    return agreedCancelFail('RESERVATION_NOT_FOUND');
  }

  const now = await getRequestNow();
  const status = fakeAgreedCancelStatus();
  return ok({
    reservationId,
    status,
    canRequest: isAgreedCancelTarget(target) && status !== 'requested',
    request: fakeAgreedCancelRequest(reservationId, status, now),
    baseAmount: calcAgreedCancel(target).baseAmount,
    serverNow: now.toISOString(),
  });
}

const requestSchema = z
  .object({
    reservationId: z.uuid(),
    reason: z.enum(AGREED_CANCEL_REASONS),
    reasonText: z.string().nullish(),
  })
  .transform(({ reasonText, ...rest }) => ({
    ...rest,
    // 기타가 아니면 내용은 버린다
    reasonText: rest.reason === 'other' ? (reasonText ?? '').trim() : null,
  }))
  .refine(
    ({ reason, reasonText }) =>
      reason !== 'other' ||
      (reasonText !== null &&
        reasonText.length > 0 &&
        reasonText.length <= AGREED_CANCEL_REASON_TEXT_MAX),
  );

/**
 * 원장님 [합의 후 취소 요청하기](S-410). 손님에게 알림이 가고, 손님이 24시간 안에 앱에서 동의해야 취소된다.
 * 예정 예약(방문·노쇼 처리 전, 시작 뒤 포함)에만, 답을 기다리는 요청이 없을 때만 보낼 수 있다. 가짜 버전은 저장하지 않는다
 */
export async function requestAgreedCancel(input: {
  reservationId: string;
  reason: string;
  reasonText?: string | null;
}): Promise<AgreedCancelResult<RequestedAgreedCancel>> {
  const auth = await requireOwner();
  if (!auth.ok) return auth;
  if (!idSchema.safeParse(input?.reservationId).success) {
    return agreedCancelFail('RESERVATION_NOT_FOUND');
  }
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return agreedCancelFail('INVALID_INPUT');
  const switched = fakeAgreedCancelFailure('requestAgreedCancel');
  if (switched) return switched;

  const { reservationId } = parsed.data;
  const target = await readAgreedCancelTarget(getDb(), reservationId);
  if (!target || target.shopId !== auth.data.shopId) {
    return agreedCancelFail('RESERVATION_NOT_FOUND');
  }
  if (!isAgreedCancelTarget(target)) return agreedCancelFail('NOT_REQUESTABLE');
  if (fakeAgreedCancelStatus() === 'requested') return agreedCancelFail('ALREADY_REQUESTED');

  const now = await getRequestNow();
  return ok({
    requestId: reservationId,
    requestedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + AGREED_CANCEL_RESPONSE_HOURS * HOUR_MS).toISOString(),
  });
}

/**
 * 고객 내 예약 상세의 요청 카드(C-506). 답을 기다리는 요청이 있으면 그 내용, 없으면 null.
 * 기한이 지났거나 예약이 취소·방문·노쇼 처리됐으면 null(카드를 숨긴다). 내 예약만
 */
export async function getAgreedCancelRequest(
  reservationId: string,
): Promise<AgreedCancelResult<PendingAgreedCancel | null>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  if (!idSchema.safeParse(reservationId).success) return agreedCancelFail('REQUEST_NOT_FOUND');
  const target = await readAgreedCancelTarget(getDb(), reservationId);
  if (!target || target.customerId !== auth.data.customerId) {
    return agreedCancelFail('REQUEST_NOT_FOUND');
  }

  const now = await getRequestNow();
  const request = fakeAgreedCancelRequest(reservationId, fakeAgreedCancelStatus(), now);
  if (!request || request.respondedAt !== null || !isAgreedCancelTarget(target)) return ok(null);
  return ok({
    requestId: request.requestId,
    reason: request.reason,
    reasonText: request.reasonText,
    refundAmount: calcAgreedCancel(target).refundAmount,
    paidAmount: target.paidAmount,
    couponAmount: target.couponAmount,
    requestedAt: request.requestedAt,
    expiresAt: request.expiresAt,
    serverNow: now.toISOString(),
  });
}

const respondSchema = z.object({ requestId: z.uuid(), agree: z.boolean() });

/**
 * 고객 [동의하고 취소할게요] / [동의하지 않아요](C-506). 동의하면 결제액의 50%를 환불하고 예약을 취소한다(쓴 쿠폰은 돌려주지 않는다).
 * 동의하지 않으면 예약은 그대로다. 화면은 [동의하고 취소할게요]에서 확인 창을 한 번 더 띄운다(11/10 Q1). 가짜 버전은 저장·환불하지 않는다
 */
export async function respondAgreedCancel(input: {
  requestId: string;
  agree: boolean;
}): Promise<AgreedCancelResult<AgreedCancelResponse>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  const parsed = respondSchema.safeParse(input);
  if (!parsed.success) return agreedCancelFail('REQUEST_NOT_FOUND');
  const switched = fakeAgreedCancelFailure('respondAgreedCancel');
  if (switched) return switched;

  // 가짜 버전은 요청 id가 예약 id다
  const reservationId = parsed.data.requestId;
  const target = await readAgreedCancelTarget(getDb(), reservationId);
  if (!target || target.customerId !== auth.data.customerId) {
    return agreedCancelFail('REQUEST_NOT_FOUND');
  }
  const status = fakeAgreedCancelStatus();
  if (status === 'none') return agreedCancelFail('REQUEST_NOT_FOUND');
  if (status === 'expired') return agreedCancelFail('REQUEST_EXPIRED');
  if (status === 'agreed' || status === 'declined') return agreedCancelFail('ALREADY_RESPONDED');
  if (status === 'closed' || !isAgreedCancelTarget(target)) {
    return agreedCancelFail('RESERVATION_CHANGED');
  }

  const now = (await getRequestNow()).toISOString();
  return ok(
    parsed.data.agree
      ? {
          agreed: true,
          reservationId,
          refundAmount: calcAgreedCancel(target).refundAmount,
          cancelledAt: now,
        }
      : { agreed: false, reservationId, declinedAt: now },
  );
}
