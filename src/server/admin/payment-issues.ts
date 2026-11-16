'use server';

// 운영자 결제·환불 확인 (#373 ①). 운영자 화면 /admin/payment-issues(강규민)에서 부른다. 모두 운영자만(requireAdmin).
//
// - retryStuckOrder: 결제 정리 작업이 고치지 못한 주문을 정리 작업과 같은 처리(sweepOneOrder)로 한 번 더 정리한다.
//   결제 확인(paid) 주문은 결제 취소(자동 취소)를 다시 하고, 결제 대기(pending) 주문은 포트원에 물어 확정·실패·자동 취소를 정한다
// - retryStuckCancel: 끝나지 않은 고객 취소·합의 후 취소를 취소 정리 작업과 같은 처리(settleRequestedCancel)로 한 번 더 정리한다
// - checkRefundReview: 금액 확인이 필요한 환불(review_reason)을 확인했다고 기록한다. 금액·환불은 바꾸지 않는다
//
// 사유는 필수이고 결과와 함께 운영자 처리 기록(admin_actions)에 남는다. 다시 시도는 포트원을 부르고, 저장은 그 함수들이 각자
// 트랜잭션으로 하므로 처리 기록은 결과가 나온 뒤에 남긴다. 금액은 그 함수들이 계산하고, 손님·원장님 알림도 지금처럼 그 함수들이 보낸다.
// 정리 대상이 되기 전(결제·취소가 아직 진행 중일 수 있음)이면 TOO_SOON. 정리 작업과 같은 기준이다

import { z } from 'zod';

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { ok } from '@/lib/result';
import { requireAdmin } from '@/server/auth';
import { readStaleOrders } from '@/server/payments/order-store';
import { sweepOneOrder } from '@/server/payments/sweep-orders';
import { STALE_CANCEL_MINUTES, STALE_ORDER_MINUTES } from '@/server/policy';
import { type SettleResult, settleRequestedCancel } from '@/server/refunds/finish-cancel';
import { readStaleCancels } from '@/server/refunds/refund-store';

import { recordAdminAction } from './action-store';
import { paymentIssueFail, type PaymentIssueResult } from './payment-issues-errors';
import {
  hasRequestedCancel,
  lockRefundReview,
  readOrderState,
  REFUND_REVIEW_CHECK_ACTION,
} from './payment-issues-store';
import type {
  CheckedRefund,
  CheckRefundReviewInput,
  RetriedCancel,
  RetriedOrder,
  RetryStuckCancelInput,
  RetryStuckOrderInput,
} from './payment-issues-types';
import { toAdminReason } from './reason';

const idSchema = z.uuid();

function minutesBefore(now: Date, minutes: number): Date {
  return new Date(now.getTime() - minutes * 60 * 1000);
}

/** 주문 [다시 시도]. 없는 주문이면 ORDER_NOT_FOUND, 이미 정리됐으면 ALREADY_RESOLVED, 아직 결제 중일 수 있으면 TOO_SOON */
export async function retryStuckOrder(
  input: RetryStuckOrderInput,
): Promise<PaymentIssueResult<RetriedOrder>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!idSchema.safeParse(input?.orderId).success) return paymentIssueFail('ORDER_NOT_FOUND');
  const reason = toAdminReason(input?.reason);
  if (!reason.ok) return paymentIssueFail(reason.problem);
  const now = await getRequestNow();
  const db = getDb();

  const [order] = await readStaleOrders(db, {
    createdBefore: minutesBefore(now, STALE_ORDER_MINUTES),
    limit: 1,
    orderId: input.orderId,
  });
  if (!order) {
    const state = await readOrderState(db, input.orderId);
    if (!state) return paymentIssueFail('ORDER_NOT_FOUND');
    return paymentIssueFail(
      state.status === 'pending' || state.status === 'paid' ? 'TOO_SOON' : 'ALREADY_RESOLVED',
    );
  }

  const result = await sweepOneOrder(db, order, now);
  await recordAdminAction(db, {
    adminId: auth.data.userId,
    action: 'payment.retry',
    targetType: 'order',
    targetId: order.orderId,
    memo: `${result}: ${reason.reason}`,
  });
  return ok({ orderId: order.orderId, result });
}

/** 환불 [다시 시도]. 진행 중인 취소가 없으면 CANCEL_NOT_FOUND, 아직 진행 중일 수 있으면 TOO_SOON */
export async function retryStuckCancel(
  input: RetryStuckCancelInput,
): Promise<PaymentIssueResult<RetriedCancel>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!idSchema.safeParse(input?.reservationId).success) {
    return paymentIssueFail('CANCEL_NOT_FOUND');
  }
  const reason = toAdminReason(input?.reason);
  if (!reason.ok) return paymentIssueFail(reason.problem);
  const now = await getRequestNow();
  const db = getDb();

  const [request] = await readStaleCancels(db, {
    requestedBefore: minutesBefore(now, STALE_CANCEL_MINUTES),
    limit: 1,
    reservationId: input.reservationId,
  });
  if (!request) {
    return paymentIssueFail(
      (await hasRequestedCancel(db, input.reservationId)) ? 'TOO_SOON' : 'CANCEL_NOT_FOUND',
    );
  }

  let result: SettleResult = 'left';
  try {
    result = await settleRequestedCancel(db, request, now);
  } catch (error) {
    // 정리 작업처럼 left로 보고 다음 실행(또는 다음 [다시 시도])이 이어서 한다
    console.error(
      '[admin] 환불 다시 시도 실패:',
      request.reservationId,
      error instanceof Error ? error.name : 'unknown',
    );
  }
  await recordAdminAction(db, {
    adminId: auth.data.userId,
    action: 'refund.retry',
    targetType: 'reservation',
    targetId: request.reservationId,
    memo: `${result}: ${reason.reason}`,
  });
  return ok({ reservationId: request.reservationId, result });
}

/** 금액 확인이 필요한 환불 [확인함]. 확인할 것이 없으면 NO_REVIEW_NEEDED, 이미 확인했으면 ALREADY_CHECKED */
export async function checkRefundReview(
  input: CheckRefundReviewInput,
): Promise<PaymentIssueResult<CheckedRefund>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!idSchema.safeParse(input?.refundId).success) return paymentIssueFail('REFUND_NOT_FOUND');
  const reason = toAdminReason(input?.reason);
  if (!reason.ok) return paymentIssueFail(reason.problem);

  return getDb().transaction(async (tx): Promise<PaymentIssueResult<CheckedRefund>> => {
    const review = await lockRefundReview(tx, input.refundId);
    if (!review) return paymentIssueFail('REFUND_NOT_FOUND');
    if (!review.reviewReason) return paymentIssueFail('NO_REVIEW_NEEDED');
    if (review.checked) return paymentIssueFail('ALREADY_CHECKED');
    await recordAdminAction(tx, {
      adminId: auth.data.userId,
      action: REFUND_REVIEW_CHECK_ACTION,
      targetType: 'refund',
      targetId: input.refundId,
      memo: reason.reason,
    });
    return ok({ refundId: input.refundId });
  });
}
