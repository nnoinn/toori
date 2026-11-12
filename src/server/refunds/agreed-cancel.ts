'use server';

// 합의 후 취소 (S-410·C-506·X-208, 연결 #19, #301, #320). 원장님 예약 상세의 [예약 취소] → "손님과 합의 후 취소"(정민석 S-410)와
// 고객 내 예약 상세의 요청 카드(정찬형 C-506)에서 부른다. 화면에서는 '@/server/refunds/agreed-cancel'에서 가져온다.
//
// - 요청·상태 읽기·거절은 진짜다(agreed_cancel_requests, 0012). 만료는 상태를 바꾸기 전이라도 expires_at으로 판단하고,
//   5분마다 도는 작업이 '만료'로 바꾸고 원장님에게 알린다(agreed-cancel-expiry.ts). 손님이 답하기 전에 예약이 바뀌면 '끝남'으로 본다
// - 동의(부분 환불·예약 취소)는 다음 PR(X-208 ②)에서 진짜로 바뀐다. 지금은 요청을 확인한 뒤 "곧 열려요"로 답하고 예약은 그대로다
// - 실패 화면은 로컬에서 DEV_FAKE_AGREED_CANCEL_FAILURE로 흉내 낸다(agreed-cancel-dev-failure.ts)

import { z } from 'zod';

import { getDb } from '@/db';
import { violatedConstraint } from '@/lib/db-error';
import { getRequestNow } from '@/lib/request-time';
import { ok } from '@/lib/result';
import { requireCustomer, requireOwner } from '@/server/auth';
import {
  notifyAgreedCancelRequested,
  notifyAgreedCancelResult,
} from '@/server/notifications/alerts';
import { AGREED_CANCEL_RESPONSE_HOURS } from '@/server/policy/refund';

import { devAgreedCancelFailure } from './agreed-cancel-dev-failure';
import { type AgreedCancelResult, agreedCancelFail } from './agreed-cancel-errors';
import {
  calcAgreedCancel,
  currentRequestStatus,
  isAgreedCancelTarget,
  respondBlockReason,
} from './agreed-cancel-rules';
import {
  type AgreedCancelRequestRow,
  declineAgreedCancelRequest,
  expireReservationRequests,
  insertAgreedCancelRequest,
  readAgreedCancelRequest,
  readAgreedCancelTarget,
  readLatestAgreedCancelRequest,
} from './agreed-cancel-store';
import {
  AGREED_CANCEL_REASON_TEXT_MAX,
  AGREED_CANCEL_REASONS,
  type AgreedCancelRequestInfo,
  type AgreedCancelResponse,
  type AgreedCancelStatusView,
  type PendingAgreedCancel,
  type RequestedAgreedCancel,
} from './agreed-cancel-types';

const idSchema = z.uuid();
const HOUR_MS = 60 * 60 * 1000;

function toInfo(request: AgreedCancelRequestRow, status: string): AgreedCancelRequestInfo {
  return {
    requestId: request.requestId,
    reason: request.reason,
    reasonText: request.reasonText,
    requestedAt: request.requestedAt.toISOString(),
    expiresAt: request.expiresAt.toISOString(),
    // 저장 전에 시각으로 만료로 본 요청은 만료 시각을 응답 시각으로 보여준다
    respondedAt:
      request.respondedAt?.toISOString() ??
      (status === 'expired' ? request.expiresAt.toISOString() : null),
  };
}

/** 원장님 예약 상세(S-410): 그 예약의 합의 후 취소 상태와 요청할 수 있는지. 내 샵 예약만 */
export async function getAgreedCancelStatus(
  reservationId: string,
): Promise<AgreedCancelResult<AgreedCancelStatusView>> {
  const auth = await requireOwner();
  if (!auth.ok) return auth;
  if (!idSchema.safeParse(reservationId).success) return agreedCancelFail('RESERVATION_NOT_FOUND');
  const db = getDb();
  const target = await readAgreedCancelTarget(db, reservationId);
  if (!target || target.shopId !== auth.data.shopId) {
    return agreedCancelFail('RESERVATION_NOT_FOUND');
  }

  const now = await getRequestNow();
  const latest = await readLatestAgreedCancelRequest(db, reservationId);
  const status = latest ? currentRequestStatus(latest, target, now) : 'none';
  return ok({
    reservationId,
    status,
    canRequest: isAgreedCancelTarget(target) && status !== 'requested',
    request: latest ? toInfo(latest, status) : null,
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
 * 예정 예약(방문·노쇼 처리 전, 시작 뒤 포함)에만, 답을 기다리는 요청이 없을 때만 보낼 수 있다(횟수 제한 없음, 11/10).
 * 만료 시각이 지난 '답 기다림' 요청은 같은 트랜잭션에서 '만료'로 바꾸고 새 요청을 넣는다(#320 리뷰)
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
  const switched = devAgreedCancelFailure('requestAgreedCancel');
  if (switched) return switched;

  const { reservationId, reason, reasonText } = parsed.data;
  const now = await getRequestNow();
  const expiresAt = new Date(now.getTime() + AGREED_CANCEL_RESPONSE_HOURS * HOUR_MS);
  const db = getDb();
  let saved: AgreedCancelResult<RequestedAgreedCancel>;
  try {
    saved = await db.transaction(async (tx): Promise<AgreedCancelResult<RequestedAgreedCancel>> => {
      const target = await readAgreedCancelTarget(tx, reservationId, { lock: true });
      if (!target || target.shopId !== auth.data.shopId) {
        return agreedCancelFail('RESERVATION_NOT_FOUND');
      }
      if (!isAgreedCancelTarget(target)) return agreedCancelFail('NOT_REQUESTABLE');
      await expireReservationRequests(tx, { reservationId, now });
      const { requestId } = await insertAgreedCancelRequest(tx, {
        reservationId,
        requestedBy: auth.data.userId,
        reason,
        reasonText,
        requestedAt: now,
        expiresAt,
      });
      return ok({ requestId, requestedAt: now.toISOString(), expiresAt: expiresAt.toISOString() });
    });
  } catch (error) {
    // 답을 기다리는 요청이 이미 있다(한 예약에 하나, agreed_cancel_requests_pending_unique)
    if (violatedConstraint(error) === 'agreed_cancel_requests_pending_unique') {
      return agreedCancelFail('ALREADY_REQUESTED');
    }
    throw error;
  }
  if (saved.ok) {
    notifyAgreedCancelRequested(db, { reservationId, requestId: saved.data.requestId });
  }
  return saved;
}

/**
 * 고객 내 예약 상세의 요청 카드(C-506). 답을 기다리는 요청이 있으면 그 내용, 없으면 null.
 * 만료 시각이 지났거나 예약이 취소·방문·노쇼 처리됐으면 null(카드를 숨긴다). 내 예약만
 */
export async function getAgreedCancelRequest(
  reservationId: string,
): Promise<AgreedCancelResult<PendingAgreedCancel | null>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  if (!idSchema.safeParse(reservationId).success) return agreedCancelFail('REQUEST_NOT_FOUND');
  const db = getDb();
  const target = await readAgreedCancelTarget(db, reservationId);
  if (!target || target.customerId !== auth.data.customerId) {
    return agreedCancelFail('REQUEST_NOT_FOUND');
  }

  const now = await getRequestNow();
  const latest = await readLatestAgreedCancelRequest(db, reservationId);
  if (!latest || currentRequestStatus(latest, target, now) !== 'requested') return ok(null);
  return ok({
    requestId: latest.requestId,
    reason: latest.reason,
    reasonText: latest.reasonText,
    refundAmount: calcAgreedCancel(target).refundAmount,
    paidAmount: target.paidAmount,
    couponAmount: target.couponAmount,
    requestedAt: latest.requestedAt.toISOString(),
    expiresAt: latest.expiresAt.toISOString(),
    serverNow: now.toISOString(),
  });
}

const respondSchema = z.object({ requestId: z.uuid(), agree: z.boolean() });

/**
 * 고객 [동의하고 취소할게요] / [동의하지 않아요](C-506). 만료 시각 뒤에는 막는다(#320 리뷰).
 * 동의하지 않으면 '거절'로 바꾸고 원장님에게 알린다(예약은 그대로). 화면은 [동의하고 취소할게요]에서 확인 창을 한 번 더 띄운다(11/10 Q1).
 * 동의(결제액 50% 환불·예약 취소)는 다음 PR에서 열린다. 지금은 요청을 확인한 뒤 예약은 그대로 두고 REFUND_FAILED로 안내한다
 */
export async function respondAgreedCancel(input: {
  requestId: string;
  agree: boolean;
}): Promise<AgreedCancelResult<AgreedCancelResponse>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  const parsed = respondSchema.safeParse(input);
  if (!parsed.success) return agreedCancelFail('REQUEST_NOT_FOUND');
  const switched = devAgreedCancelFailure('respondAgreedCancel');
  if (switched) return switched;

  const { requestId, agree } = parsed.data;
  const db = getDb();
  const found = await readAgreedCancelRequest(db, requestId);
  if (!found || found.target.customerId !== auth.data.customerId) {
    return agreedCancelFail('REQUEST_NOT_FOUND');
  }
  const now = await getRequestNow();
  const blocked = respondBlockReason(currentRequestStatus(found.request, found.target, now));
  if (blocked) return agreedCancelFail(blocked);
  const reservationId = found.request.reservationId;

  if (!agree) {
    if (!(await declineAgreedCancelRequest(db, { requestId, now }))) {
      // 그 사이 답했거나 만료됐거나 예약이 바뀌었다. 다시 읽어 이유를 준다
      const again = await readAgreedCancelRequest(db, requestId);
      const reason = again
        ? respondBlockReason(currentRequestStatus(again.request, again.target, now))
        : null;
      return agreedCancelFail(reason ?? 'ALREADY_RESPONDED');
    }
    notifyAgreedCancelResult(db, { reservationId, requestId, result: 'declined' });
    return ok({ agreed: false, reservationId, declinedAt: now.toISOString() });
  }

  // 동의(부분 환불·예약 취소)는 X-208 ② PR에서 진짜로 바뀐다. 그 전까지는 예약을 그대로 둔다
  return {
    ok: false,
    error: {
      code: 'REFUND_FAILED',
      message: '합의 후 취소 동의는 곧 열려요. 예약은 그대로예요',
    },
  };
}
