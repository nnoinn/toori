// 우리 기록에 없는 포트원 취소를 예약에 맞춘다 (X-204, W13, #222). 웹훅이 부른다. 서버에서만 부른다.
// 원장님이 오지 않을 손님을 기다리지 않도록, 돈이 돌아갔으면 예약을 '취소'로 끝낸다.
// 포트원 취소 내역의 사유로 누가 취소했는지 가른다(11/8 nnoinn, #248).
// - 앱이 보낸 고객 취소('고객 예약 취소')를 포트원이 나중에 처리했으면 고객 취소로 끝낸다
// - 그 밖(포트원 콘솔에서 직접 취소 등 앱을 거치지 않은 취소)은 운영자 취소(admin_exception)로 실제 환불액을 남긴다

import 'server-only';

import type { getDb } from '@/db';
import { hoursUntil } from '@/lib/time';
import type { FinishedCancellation } from '@/server/payments/portone';

import { calcRefund } from './calc-refund';
import { finishCancel } from './finish-cancel';
import { CUSTOMER_CANCEL_REASON } from './refund-payment';
import { finishAdminCancel, readRefundTargetByOrder, type RefundTarget } from './refund-store';

type Db = ReturnType<typeof getDb>;

const LATE_CUSTOMER_CANCEL_NOTE = '포트원이 나중에 처리한 고객 취소예요';

/**
 * cancel_recorded: 취소를 기록했다. cancel_known: 이미 기록했거나 바꾸지 않는다.
 * retry: 진행 중인 취소가 있다. 앞선 요청이나 정리 작업이 끝낼 텐데, 기록이 지워질 수도 있어서 포트원이 다시 보내게 한다
 */
export type CancelSync = 'cancel_recorded' | 'cancel_known' | 'retry';

/** 끝난 취소가 모두 앱이 보낸 고객 취소인지 */
export function isAppCustomerCancel(refund: FinishedCancellation): boolean {
  return (
    refund.reasons.length > 0 && refund.reasons.every((reason) => reason === CUSTOMER_CANCEL_REASON)
  );
}

export async function syncUnrecordedCancel(
  db: Db,
  orderId: string,
  refund: FinishedCancellation,
  now: Date,
): Promise<CancelSync> {
  const target = await readRefundTargetByOrder(db, orderId);
  if (!target) {
    console.error('[cancel] 확정된 주문에 예약이 없어요:', orderId);
    return 'cancel_known';
  }
  if (target.requested) return 'retry';
  if (target.status !== 'confirmed') {
    if (target.status === 'completed') {
      console.error('[cancel] 이용 완료한 예약에 포트원 취소가 있어요:', target.reservationId);
    }
    return 'cancel_known';
  }

  const finished = isAppCustomerCancel(refund)
    ? await recordLateCustomerCancel(db, target, refund, now)
    : await recordAdminCancel(db, target, refund, now);
  return finished ? 'cancel_recorded' : 'cancel_known';
}

async function recordLateCustomerCancel(
  db: Db,
  target: RefundTarget,
  refund: FinishedCancellation,
  now: Date,
): Promise<boolean> {
  const calc = calcRefund({
    paidAmount: target.paidAmount,
    salePrice: target.salePrice,
    startAt: target.startAt,
    now,
  });
  if (calc.band === null) throw new Error('고객 취소에는 위약금 구간이 있어야 해요');
  console.error('[cancel] 포트원이 나중에 처리한 고객 취소를 반영해요:', target.reservationId);
  const finished = await finishCancel(
    db,
    {
      ...target,
      band: calc.band,
      penaltyRate: calc.penaltyRate,
      refundAmount: calc.refundAmount,
      penaltyAmount: calc.penaltyAmount,
      requestedAt: now,
    },
    refund,
    now,
    LATE_CUSTOMER_CANCEL_NOTE,
  );
  return finished !== null;
}

async function recordAdminCancel(
  db: Db,
  target: RefundTarget,
  refund: FinishedCancellation,
  now: Date,
): Promise<boolean> {
  const refundAmount = refund.amount ?? target.paidAmount;
  const reviewReason =
    refund.amount === null
      ? `앱을 거치지 않은 취소인데 포트원 취소 금액을 알 수 없어서 결제액 ${target.paidAmount}원으로 기록했어요`
      : refundAmount < target.paidAmount
        ? `앱을 거치지 않은 취소로 결제액 ${target.paidAmount}원 중 ${refundAmount}원만 돌려줬어요`
        : null;
  console.error(
    '[cancel] 앱을 거치지 않은 포트원 취소를 운영자 취소로 기록해요:',
    target.reservationId,
  );
  return db.transaction((tx) =>
    finishAdminCancel(tx, {
      reservationId: target.reservationId,
      orderId: target.orderId,
      slotId: target.slotId,
      paidAmount: target.paidAmount,
      refundAmount,
      pgCancellationId: refund.cancellationId,
      reviewReason,
      hoursBeforeStart: hoursUntil(target.startAt, now),
      now,
    }),
  );
}
