// 예약 무효(A-108, #423)의 환불 진행. 서버에서만 부른다. 운영자 서버 함수(void-reservation.ts)와 정리 작업(sweepStaleVoids)이 같이 쓴다.
// 포트원에 남은 금액만 돌려주고(사유 '예약 무효', 지금 취소할 수 있는 금액 = 결제액 − 이미 돌려준 금액), 결과가 나오면 한 트랜잭션에서 무효를 끝낸다.
// 포트원을 부르는 동안 DB를 잠그지 않는다. 중간에 멈추면 정리 작업이 포트원 취소 내역에서 무효 환불을 찾아 끝내거나 진행 중 기록을 지운다.
// 다시 눌러도 포트원이 지금 취소할 수 있는 금액으로 앞선 환불을 알아채서 두 번 환불되지 않는다

import 'server-only';

import type { getDb } from '@/db';
import { notifyReservationVoided } from '@/server/notifications/alerts';
import {
  type FinishedCancellation,
  finishedCancellation,
  getPortOnePayment,
} from '@/server/payments/portone';
import { ORDER_SWEEP_BATCH, STALE_CANCEL_MINUTES } from '@/server/policy';

import { refundPayment, skipsPortOne, VOID_REFUND_REASON } from './refund-payment';
import { clearVoidRequest, finishVoid, readStaleVoids } from './void-store';

type Db = ReturnType<typeof getDb>;

export type VoidRefundLookup =
  { state: 'refunded'; refund: FinishedCancellation } | { state: 'pending' } | { state: 'none' };

/** 포트원 취소 내역에서 무효 환불(사유 '예약 무효')을 찾는다. 앞선 고객 취소 환불과 섞이지 않게 사유로 가른다 */
export async function lookUpVoidRefund(paymentId: string): Promise<VoidRefundLookup> {
  const lookup = await getPortOnePayment(paymentId);
  if (!lookup.ok) return lookup.reason === 'unavailable' ? { state: 'pending' } : { state: 'none' };
  const refund = finishedCancellation({
    ...lookup.payment,
    cancellations: lookup.payment.cancellations.filter(
      (cancellation) => cancellation.reason === VOID_REFUND_REASON,
    ),
  });
  if (refund) return { state: 'refunded', refund };
  return lookup.payment.cancelInProgress ? { state: 'pending' } : { state: 'none' };
}

/** 무효로 끝낼 예약과 이번에 돌려줄 금액 */
export type VoidRefundInput = {
  reservationId: string;
  orderId: string;
  slotId: string;
  paymentId: string;
  startAt: Date;
  /** 이번에 돌려줄 금액(진행 중 기록의 금액) */
  refundAmount: number;
};

/** finished: 무효를 끝냈다. already: 그 사이 다른 쪽이 끝냈다. pending: 결과를 기다린다(정리 작업이 끝낸다). failed: 돌려준 돈이 없다(진행 중 기록을 지웠다) */
export type VoidRefundOutcome =
  | { state: 'finished'; refundAmount: number }
  | { state: 'already' }
  | { state: 'pending' }
  | { state: 'failed' };

/** 환불이 끝난 무효를 기록하고 손님·원장님에게 알린다. 포트원이 금액을 알려주지 않으면 진행 중 기록의 금액으로 남긴다 */
async function finishAndNotify(
  db: Db,
  input: VoidRefundInput,
  refund: { cancellationId: string | null; amount: number | null },
  now: Date,
): Promise<VoidRefundOutcome> {
  const refundAmount = refund.amount ?? input.refundAmount;
  const finished = await db.transaction((tx) =>
    finishVoid(tx, {
      reservationId: input.reservationId,
      orderId: input.orderId,
      slotId: input.slotId,
      startAt: input.startAt,
      refundAmount,
      pgCancellationId: refund.cancellationId,
      now,
    }),
  );
  if (!finished) return { state: 'already' };
  notifyReservationVoided(db, input.reservationId, {
    refundAmount,
    couponReturned: finished.couponReturned,
  });
  return { state: 'finished', refundAmount };
}

/** 포트원 취소 내역을 보고 끝내거나(돈이 돌아갔음) 진행 중 기록을 지운다(돌아간 돈 없음) */
async function settleByLookup(
  db: Db,
  input: VoidRefundInput,
  now: Date,
): Promise<VoidRefundOutcome> {
  // 시드·시나리오 주문은 포트원에 결제가 없어서 물을 수 없다. 포트원을 부르지 않는 환불이라 바로 끝낸다
  const found: VoidRefundLookup = skipsPortOne(input.paymentId, input.refundAmount)
    ? {
        state: 'refunded',
        refund: { cancellationId: null, amount: input.refundAmount, reasons: [] },
      }
    : await lookUpVoidRefund(input.paymentId);
  if (found.state === 'pending') return { state: 'pending' };
  if (found.state === 'none') {
    await clearVoidRequest(db, input.reservationId);
    return { state: 'failed' };
  }
  return finishAndNotify(db, input, found.refund, now);
}

/** 진행 중으로 저장한 무효의 환불을 포트원에 요청하고 결과대로 끝낸다(운영자 서버 함수) */
export async function runVoidRefund(
  db: Db,
  input: VoidRefundInput & {
    paidAmount: number;
    /** 이미 돌려준 금액. 지금 취소할 수 있는 금액 = 결제액 − 이 값 */
    refundedAmount: number;
  },
  now: Date,
): Promise<VoidRefundOutcome> {
  const refund = await refundPayment({
    paymentId: input.paymentId,
    paidAmount: input.paidAmount,
    refundAmount: input.refundAmount,
    reason: VOID_REFUND_REASON,
    cancellableAmount: input.paidAmount - input.refundedAmount,
  });
  // 결과를 기다리거나 모르면 진행 중으로 두고 정리 작업이 포트원에 물어 정한다
  if (!refund.ok && refund.reason !== 'rejected') return { state: 'pending' };
  try {
    // 거절 답이 와도 앞선 요청의 환불로 돈이 돌아갔을 수 있다. 지우기 전에 취소 내역을 본다
    if (!refund.ok) return await settleByLookup(db, input, now);
    return await finishAndNotify(db, input, refund, now);
  } catch (error) {
    // 저장만 못 했다. 진행 중 기록이 남아 있어서 정리 작업이 포트원 취소 내역을 보고 끝내거나 지운다
    logVoidError('환불 뒤 저장 실패:', input.reservationId, error);
    return { state: 'pending' };
  }
}

export type VoidSweepSummary = { checked: number; finished: number; cleared: number; left: number };

/**
 * 진행 중으로 남은 무효를 정리한다(예약 작업 payments-sweep이 고객 취소 정리와 같이 부른다, sweep-cancels.ts). 포트원은 다시 부르지 않고
 * 취소 내역만 본다. 한 건이 실패해도 나머지는 계속한다
 */
export async function sweepStaleVoids(db: Db, now: Date): Promise<VoidSweepSummary> {
  const requestedBefore = new Date(now.getTime() - STALE_CANCEL_MINUTES * 60 * 1000);
  const stale = await readStaleVoids(db, { requestedBefore, limit: ORDER_SWEEP_BATCH });
  const summary: VoidSweepSummary = { checked: stale.length, finished: 0, cleared: 0, left: 0 };
  for (const row of stale) {
    try {
      const outcome = await settleByLookup(db, row, now);
      if (outcome.state === 'finished' || outcome.state === 'already') summary.finished += 1;
      else if (outcome.state === 'failed') summary.cleared += 1;
      else summary.left += 1;
    } catch (error) {
      logVoidError('무효 정리 실패:', row.reservationId, error);
      summary.left += 1;
    }
  }
  return summary;
}

function logVoidError(message: string, reservationId: string, error: unknown) {
  console.error(
    `[void] ${message}`,
    reservationId,
    error instanceof Error ? error.name : 'unknown',
  );
}
