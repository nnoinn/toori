// 포트원에서 결제 완료(PAID)를 확인한 주문의 처리 (X-201, C-406, W12). 서버에서만 부른다. 결제 확인(confirmPayment)과 웹훅(W13)이 같이 쓴다.
// 금액이 맞고 확정할 수 있으면 예약을 확정하고, 아니면 포트원에서 결제를 취소해 전액 돌려준다.
// 포트원 호출 동안 DB 줄을 잠그지 않도록, 주문을 결제 확인(paid)으로 먼저 저장한 뒤 취소한다.
// 취소하지 못했거나 기록 전에 서버가 멈춰도 주문이 paid로 남아서, 다시 부르면 이어서 처리된다(이미 취소된 결제는 포트원 취소 내역으로 기록).

import 'server-only';

import type { getDb } from '@/db';

import { confirmPaidOrder, recordAutoCancel, recordOrderOutcome } from './confirm-store';
import type { UnconfirmedCode } from './errors';
import { cancelPortOnePayment, type PortOnePayment } from './portone';

type Db = ReturnType<typeof getDb>;

/** 포트원에 남기는 취소 사유 */
const AUTO_CANCEL_REASON = '예약을 확정하지 못해 자동 취소';

export type SettleOutcome =
  | { ok: true; reservationId: string; reservationCode: string }
  /** autoCancelled: 포트원에서 결제를 취소했으면 true. false면 주문이 paid로 남아 있어 다시 시도한다 */
  | { ok: false; code: UnconfirmedCode; autoCancelled: boolean };

/** 결제 완료를 확인한 주문을 예약으로 확정하거나, 확정할 수 없으면 자동 취소한다. 트랜잭션 밖에서 부른다 */
export async function settlePaidOrder(
  db: Db,
  order: { orderId: string; paymentId: string; amount: number },
  payment: PortOnePayment,
  now: Date,
): Promise<SettleOutcome> {
  if (payment.amountTotal !== order.amount || (payment.currency && payment.currency !== 'KRW')) {
    console.error('[payments] 결제 금액이 주문과 달라요:', order.orderId);
    await recordOrderOutcome(db, order.orderId, {
      status: 'paid',
      pgStatus: payment.status,
      payMethod: payment.method,
      paidAt: payment.paidAt,
      failureCode: 'AMOUNT_MISMATCH',
    });
    return {
      ok: false,
      code: 'AMOUNT_MISMATCH',
      autoCancelled: await autoCancelOrder(db, order, now),
    };
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
  if (confirmed.ok) return confirmed;
  return { ok: false, code: confirmed.code, autoCancelled: await autoCancelOrder(db, order, now) };
}

/**
 * 결제 확인(paid) 주문의 결제를 포트원에서 취소하고 자동 취소로 기록한다. 끝났으면 true.
 * 취소하지 못했으면 false이고 주문은 그대로 paid다. 트랜잭션 밖에서 부른다
 */
export async function autoCancelOrder(
  db: Db,
  order: { orderId: string; paymentId: string },
  now: Date,
): Promise<boolean> {
  const cancel = await cancelPortOnePayment(order.paymentId, AUTO_CANCEL_REASON);
  if (!cancel.ok) {
    console.error('[payments] 자동 취소를 끝내지 못했어요:', order.orderId, cancel.reason);
    return false;
  }
  await db.transaction((tx) =>
    recordAutoCancel(tx, {
      orderId: order.orderId,
      refundAmount: cancel.amount,
      pgCancellationId: cancel.cancellationId,
      now,
    }),
  );
  return true;
}
