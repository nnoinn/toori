'use server';

// 합의 후 취소 (S-410·C-506·X-208, 연결 #19, #301, #320). 원장님 예약 상세의 [예약 취소] → "손님과 합의 후 취소"(정민석 S-410)와
// 고객 내 예약 상세의 요청 카드(정찬형 C-506)에서 부른다. 화면에서는 '@/server/refunds/agreed-cancel'에서 가져온다.
//
// - 요청·상태 읽기·거절은 진짜다(agreed_cancel_requests, 0012). 만료는 상태를 바꾸기 전이라도 expires_at으로 판단하고,
//   5분마다 도는 작업이 '만료'로 바꾸고 원장님에게 알린다(agreed-cancel-expiry.ts). 손님이 답하기 전에 예약이 바뀌면 '끝남'으로 본다
// - 동의는 고객 취소와 같은 "진행 중 먼저 저장" 방식이다(X-208 ②): 한 트랜잭션에서 요청을 '동의'로 바꾸고 환불 기록을 진행 중으로 남긴 뒤,
//   포트원에서 결제액의 50%를 돌려주고, 예약·매물을 '취소'(cancel_actor agreed)로 바꾸며 원장님에게 알린다(재등록 안내 없음).
//   돌려준 돈이 없으면 진행 중 표시를 지우고 요청을 다시 '답 기다림'으로 돌린다. 결과를 모르면 10분 정리 작업이 마무리한다
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
import { AGREED_CANCEL_REFUND_RATE, AGREED_CANCEL_RESPONSE_HOURS } from '@/server/policy/refund';

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
  markAgreedCancelRequest,
  readAgreedCancelRequest,
  readAgreedCancelTarget,
  readLatestAgreedCancelRequest,
  reopenAgreedRequest,
} from './agreed-cancel-store';
import { finishCancel, lookUpRefund, type RefundLookup } from './finish-cancel';
import { AGREED_CANCEL_REASON, refundPayment } from './refund-payment';
import {
  clearRequestedCancel,
  readRefundTarget,
  requestCancelRefund,
  type RequestedCancel,
} from './refund-store';
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
    // 답을 기다리거나 동의한 환불이 진행 중이면 새로 요청할 수 없다
    canRequest: isAgreedCancelTarget(target) && status !== 'requested' && status !== 'agreed',
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
 * 동의하면 결제액의 50%를 돌려주고 예약을 취소한다(쓴 쿠폰은 돌려주지 않는다). 환불을 못 했으면 REFUND_FAILED(예약 그대로, 다시 누를 수 있다),
 * 결과를 기다리거나 저장을 못 끝냈으면 CANCEL_FINISHING(정리 작업이 마무리한다, 다시 눌러도 같다)
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
  // 동의한 환불이 아직 끝나지 않았다(다시 누름). 정리 작업이 마무리한다
  if (found.request.status === 'agreed' && found.target.status === 'confirmed') {
    return agreedCancelFail('CANCEL_FINISHING');
  }
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

  return agreeAndRefund({ requestId, reservationId, customerId: auth.data.customerId, now });
}

/** 동의 처리 중 다른 취소 환불(손님 직접 취소)이 먼저 들어와 있을 때 트랜잭션을 되돌리는 표시 */
class OtherCancelInProgress extends Error {}

/** 동의 → 결제액 50% 환불 → 예약 취소. 고객 취소(cancelReservation)와 같은 순서와 실패 처리다 */
async function agreeAndRefund(input: {
  requestId: string;
  reservationId: string;
  customerId: string;
  now: Date;
}): Promise<AgreedCancelResult<AgreedCancelResponse>> {
  const { requestId, reservationId, now } = input;
  const db = getDb();
  const target = await readRefundTarget(reservationId, input.customerId, db);
  if (!target) return agreedCancelFail('REQUEST_NOT_FOUND');
  const { refundAmount } = calcAgreedCancel(target);
  const requested: RequestedCancel = {
    reason: 'agreed_cancel',
    band: null,
    penaltyRate: 100 - AGREED_CANCEL_REFUND_RATE,
    refundAmount,
    penaltyAmount: target.paidAmount - refundAmount,
    requestedAt: now,
  };

  let marked: boolean;
  try {
    marked = await db.transaction(async (tx) => {
      // 예약 줄을 잠근다(방문·노쇼 처리와 손님 직접 취소가 이 줄을 같이 잠근다)
      await readAgreedCancelTarget(tx, reservationId, { lock: true });
      if (!(await markAgreedCancelRequest(tx, { requestId, now }))) return false;
      const started = await requestCancelRefund(tx, {
        reservationId,
        orderId: target.orderId,
        ...requested,
      });
      if (!started) throw new OtherCancelInProgress();
      return true;
    });
  } catch (error) {
    if (error instanceof OtherCancelInProgress) return agreedCancelFail('RESERVATION_CHANGED');
    logAgreeError('동의 시작 저장 실패:', reservationId, error);
    return agreedCancelFail('REFUND_FAILED');
  }
  if (!marked) {
    // 그 사이 답했거나 만료됐거나 예약이 바뀌었다
    const again = await readAgreedCancelRequest(db, requestId);
    const reason = again
      ? respondBlockReason(currentRequestStatus(again.request, again.target, now))
      : null;
    return agreedCancelFail(reason ?? 'ALREADY_RESPONDED');
  }

  const refund = await refundPayment({
    paymentId: target.paymentId,
    paidAmount: target.paidAmount,
    refundAmount,
    reason: AGREED_CANCEL_REASON,
  });
  // 결과를 기다리거나 모르면 진행 중으로 두고 정리 작업이 포트원에 물어 정한다
  if (!refund.ok && refund.reason !== 'rejected') return agreedCancelFail('CANCEL_FINISHING');
  // 거절 답이 와도 돈이 돌아갔거나 돌아가는 중일 수 있다. 지우기 전에 취소 내역을 본다
  const found: RefundLookup = refund.ok
    ? { state: 'refunded', refund }
    : await lookUpRefund(target.paymentId);
  if (found.state === 'pending') return agreedCancelFail('CANCEL_FINISHING');
  if (found.state === 'none') {
    // 돌려준 돈이 없다. 진행 중 표시를 지우고 요청을 다시 답 기다림으로(못 지워도 정리 작업이 지운다)
    await clearRequestedCancel(db, reservationId).catch((error: unknown) => {
      logAgreeError('진행 중 표시 지우기 실패:', reservationId, error);
    });
    await reopenAgreedRequest(db, { reservationId, now }).catch((error: unknown) => {
      logAgreeError('요청 되돌리기 실패:', reservationId, error);
    });
    return agreedCancelFail('REFUND_FAILED');
  }

  try {
    const finished = await finishCancel(db, { ...target, ...requested }, found.refund, now);
    if (!finished) return agreedCancelFail('RESERVATION_CHANGED');
    return ok({
      agreed: true,
      reservationId,
      refundAmount: finished.refundAmount,
      cancelledAt: now.toISOString(),
    });
  } catch (error) {
    // 환불은 끝났다. 정리 작업이 마무리한다
    logAgreeError('환불 뒤 저장 실패:', reservationId, error);
    return agreedCancelFail('CANCEL_FINISHING');
  }
}

function logAgreeError(message: string, reservationId: string, error: unknown) {
  console.error(
    `[agreed-cancel] ${message}`,
    reservationId,
    error instanceof Error ? error.name : 'unknown',
  );
}
