// 예약 취소의 환불 진행 (W14 #222, X-207 #419). 서버에서만 부른다. 고객 취소(cancel.ts)와 원장님 귀책 취소(owner-fault-cancel.ts)가 같이 쓴다.
// 진행 중(requested)으로 먼저 저장하고, 포트원에서 환불액만 돌려준 뒤, 예약·매물을 '취소'로 바꾸고 기록을 끝낸다.
// 포트원을 부르는 동안 DB를 잠그지 않는다. 중간에 멈추면 정리 작업(sweep-cancels.ts)이 마무리한다.
// 다시 누르면 저장해 둔 금액을 쓰고, 포트원이 앞선 환불을 알려줘서 두 번 환불되지 않는다

import 'server-only';

import type { getDb } from '@/db';
import { ok } from '@/lib/result';

import { refundFail, type RefundResult } from './errors';
import { finishCancel, lookUpRefund, type RefundLookup } from './finish-cancel';
import { refundPayment } from './refund-payment';
import {
  clearRequestedCancel,
  type RefundTarget,
  type RequestedCancel,
  requestCancelRefund,
} from './refund-store';
import type { CancelledReservation } from './types';

/**
 * 취소 환불을 진행한다. target.requested가 없으면 requested로 진행 중 기록부터 남긴다(다른 요청이 먼저 남겼으면 CANCEL_FINISHING).
 * 결과를 기다리거나 모르면 CANCEL_FINISHING(진행 중으로 두고 정리 작업이 포트원에 물어 정한다), 돌려준 돈이 없으면 REFUND_FAILED
 */
export async function runCancelRefund(
  db: ReturnType<typeof getDb>,
  input: {
    target: RefundTarget;
    requested: RequestedCancel;
    now: Date;
    /** 포트원 취소 사유. 웹훅이 이 사유로 앱이 보낸 취소인지 가른다 */
    pgReason: string;
  },
): Promise<RefundResult<CancelledReservation>> {
  const { target, requested, now } = input;
  const { reservationId } = target;
  if (!target.requested) {
    try {
      const started = await requestCancelRefund(db, {
        reservationId,
        orderId: target.orderId,
        ...requested,
      });
      // 다른 요청이 같은 예약의 취소를 처리하고 있다(두 번 누름, 다른 취소와 겹침)
      if (!started) return refundFail('CANCEL_FINISHING');
    } catch (error) {
      logCancelError('취소 시작 저장 실패:', reservationId, error);
      return refundFail('REFUND_FAILED');
    }
  }

  const refund = await refundPayment({
    paymentId: target.paymentId,
    paidAmount: target.paidAmount,
    refundAmount: requested.refundAmount,
    reason: input.pgReason,
  });
  // 결과를 기다리거나 모르면 진행 중으로 두고 정리 작업이 포트원에 물어 정한다
  if (!refund.ok && refund.reason !== 'rejected') return refundFail('CANCEL_FINISHING');
  // 거절 답이 와도 돈이 돌아갔거나 돌아가는 중일 수 있다(결제사 통신 오류, 앞선 요청의 환불). 지우기 전에 취소 내역을 본다
  const found: RefundLookup = refund.ok
    ? { state: 'refunded', refund }
    : await lookUpRefund(target.paymentId);
  if (found.state === 'pending') return refundFail('CANCEL_FINISHING');
  if (found.state === 'none') {
    // 돌려준 돈이 없다. 못 지워도 정리 작업이 지운다
    await clearRequestedCancel(db, reservationId).catch((error: unknown) => {
      logCancelError('진행 중 표시 지우기 실패:', reservationId, error);
    });
    return refundFail('REFUND_FAILED');
  }

  try {
    const finished = await finishCancel(db, { ...target, ...requested }, found.refund, now);
    if (!finished) return refundFail('ALREADY_CANCELLED');
    return ok({
      reservationId,
      refundAmount: finished.refundAmount,
      cancelledAt: requested.requestedAt.toISOString(),
    });
  } catch (error) {
    // 환불은 끝났다. 정리 작업이 마무리하고, 다시 눌러도 앞선 환불을 읽어 기록한다
    logCancelError('환불 뒤 저장 실패:', reservationId, error);
    return refundFail('CANCEL_FINISHING');
  }
}

function logCancelError(message: string, reservationId: string, error: unknown) {
  console.error(`[cancel] ${message}`, reservationId, error instanceof Error ? error.name : error);
}
