// 환불이 끝난 취소(고객 취소·합의 후 취소) 기록과, 진행 중으로 남은 취소의 결과 정하기 (X-203, W14, #222, X-208 #320). 서버에서만 부른다.

import 'server-only';

import type { getDb } from '@/db';
import { hoursUntil } from '@/lib/time';
import {
  notifyAgreedCancelResult,
  notifyReservationCancelled,
} from '@/server/notifications/alerts';
import { finishedCancellation, getPortOnePayment } from '@/server/payments/portone';

import { skipsPortOne } from './refund-payment';
import { reopenAgreedRequest } from './agreed-cancel-store';
import { type CancelRequest, clearRequestedCancel, finishCancelRecord } from './refund-store';

type Db = ReturnType<typeof getDb>;

/**
 * 돌려준 금액으로 취소를 끝낸다. 먼저 기록한 요청이 있거나 예약이 이미 바뀌었으면 null.
 * 돈은 이미 돌아갔으므로, 금액이 계산과 달라도(콘솔에서 직접 취소 등) 실제 금액으로 끝내고 운영자 확인 이유와 로그를 남긴다
 */
export async function finishCancel(
  db: Db,
  request: CancelRequest,
  refund: { cancellationId: string | null; amount: number | null },
  now: Date,
  /** 금액과 상관없이 운영자가 확인해야 하는 이유 */
  reviewNote?: string,
): Promise<{ refundAmount: number } | null> {
  const refundAmount = refund.amount ?? request.refundAmount;
  const differs = refundAmount !== request.refundAmount;
  if (differs) {
    console.error(
      '[cancel] 돌려준 금액이 계산과 달라 운영자 확인이 필요해요:',
      request.reservationId,
    );
  }
  const finished = await db.transaction((tx) =>
    finishCancelRecord(tx, {
      reason: request.reason,
      reservationId: request.reservationId,
      orderId: request.orderId,
      slotId: request.slotId,
      band: request.band,
      penaltyRate: request.penaltyRate,
      refundAmount,
      penaltyAmount: differs ? request.paidAmount - refundAmount : request.penaltyAmount,
      pgCancellationId: refund.cancellationId,
      reviewReason:
        [
          reviewNote,
          differs && `포트원 환불액 ${refundAmount}원이 계산한 ${request.refundAmount}원과 달라요`,
        ]
          .filter(Boolean)
          .join('. ') || null,
      hoursBeforeStart: hoursUntil(request.startAt, request.requestedAt),
      requestedAt: request.requestedAt,
      now,
    }),
  );
  if (!finished) return null;
  // 바로 끝난 취소·정리 작업·포트원이 늦게 처리한 취소 모두 여기를 지난다
  if (request.reason === 'agreed_cancel') {
    // 합의 후 취소: 원장님에게 동의 알림(재등록 안내는 없다). 예약마다 한 번이라 예약 id로 중복을 막는다
    notifyAgreedCancelResult(db, {
      reservationId: request.reservationId,
      requestId: request.reservationId,
      result: 'agreed',
    });
  } else {
    // 고객 취소: 원장님에게 재등록 안내(S-400)
    notifyReservationCancelled(db, request.reservationId, { by: 'customer', now });
  }
  return { refundAmount };
}

/**
 * 포트원 취소 내역으로 본 환불 상태. refunded: 끝난 환불이 있다. pending: 결제사가 처리 중이거나 포트원에 묻지 못했다.
 * none: 환불이 없다(포트원에 결제가 없는 경우 포함)
 */
export type RefundLookup =
  | { state: 'refunded'; refund: { cancellationId: string | null; amount: number | null } }
  | { state: 'pending' }
  | { state: 'none' };

export async function lookUpRefund(paymentId: string): Promise<RefundLookup> {
  const lookup = await getPortOnePayment(paymentId);
  if (!lookup.ok) return lookup.reason === 'unavailable' ? { state: 'pending' } : { state: 'none' };
  const refund = finishedCancellation(lookup.payment);
  if (refund) return { state: 'refunded', refund };
  return lookup.payment.cancelInProgress ? { state: 'pending' } : { state: 'none' };
}

/**
 * 돌려준 돈이 없는 취소의 진행 중 표시를 지운다. 합의 후 취소면 요청도 다시 답 기다림(만료 시각이 지났으면 만료)으로 돌린다.
 * 한 트랜잭션이라 하나만 되는 일이 없다. 지우기만 되면 요청이 '동의'로 남아 손님은 계속 CANCEL_FINISHING, 원장님은 다시 요청할 수
 * 없고, 정리 작업도 그 요청을 다시 찾지 못한다(#346 리뷰). 실패하면 둘 다 그대로 남아 정리 작업이 다시 한다
 */
export async function clearUnrefundedCancel(
  db: Db,
  request: Pick<CancelRequest, 'reservationId' | 'reason'>,
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    await clearRequestedCancel(tx, request.reservationId);
    if (request.reason === 'agreed_cancel') {
      await reopenAgreedRequest(tx, { reservationId: request.reservationId, now });
    }
  });
}

/**
 * finished: 환불이 있어서 취소를 끝냈다. cleared: 환불이 없어서(또는 예약이 이미 바뀌어서) 진행 중 표시를 지웠다.
 * left: 결제사가 처리 중이거나 포트원에 묻지 못해 그대로 뒀다
 */
export type SettleResult = 'finished' | 'cleared' | 'left';

/** 진행 중으로 남은 취소의 결과를 포트원 취소 내역을 보고 정한다 */
export async function settleRequestedCancel(
  db: Db,
  request: CancelRequest,
  now: Date,
): Promise<SettleResult> {
  /** 돌려준 돈이 없어서 진행 중 표시를 지운다(합의 후 취소면 요청도 되돌린다, 한 트랜잭션) */
  const clear = async (): Promise<SettleResult> => {
    await clearUnrefundedCancel(db, request, now);
    return 'cleared';
  };
  const finish = async (refund: { cancellationId: string | null; amount: number | null }) => {
    if (await finishCancel(db, request, refund, now)) return 'finished';
    return clear();
  };

  if (skipsPortOne(request.paymentId, request.refundAmount)) {
    return finish({ cancellationId: null, amount: request.refundAmount });
  }

  const found = await lookUpRefund(request.paymentId);
  if (found.state === 'refunded') return finish(found.refund);
  if (found.state === 'pending') return 'left';
  return clear();
}
