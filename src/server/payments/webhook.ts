// 포트원 웹훅 처리 (X-204, W13). 서버에서만 부른다. 서명은 받는 주소(/api/webhooks/portone)가 확인한다.
// 웹훅 내용은 결제 번호만 쓰고 결과는 포트원에 다시 물어서 정한다. 그래서 같은 웹훅이 다시 오거나 순서가 바뀌어도 결과가 같다.
// 결제 확인(confirmPayment)과 정리 작업(sweep-orders.ts)이 쓰는 함수를 같이 쓴다.

import 'server-only';

import { z } from 'zod';

import type { getDb } from '@/db';
import { syncUnrecordedCancel } from '@/server/refunds/sync-cancel';

import { ABANDONED_ORDER_CODE } from './errors';
import { readOrderByPaymentId } from './order-store';
import { applyPaymentStatus } from './payment-status';
import { finishedCancellation, getPortOnePayment } from './portone';
import { autoCancelOrder } from './settle-order';
import { beginWebhookEvent, finishWebhookEvent } from './webhook-store';

type Db = ReturnType<typeof getDb>;

/** 주문이나 예약에 영향을 주는 웹훅. 나머지(결제 준비, 분쟁, 앞으로 생길 종류)는 기록만 하고 넘어간다 */
const HANDLED_TYPES = new Set([
  'Transaction.Paid',
  'Transaction.Failed',
  'Transaction.Cancelled',
  'Transaction.PartialCancelled',
]);

const webhookSchema = z.object({
  type: z.string(),
  data: z.object({ paymentId: z.string().min(1).optional() }).optional(),
});

/** retry면 받는 주소가 200이 아닌 응답을 돌려줘서 포트원이 다시 보낸다 */
export type WebhookOutcome = 'done' | 'retry';

export async function handlePortOneWebhook(
  db: Db,
  event: { webhookId: string; payload: unknown },
  now: Date,
): Promise<WebhookOutcome> {
  const parsed = webhookSchema.safeParse(event.payload);
  const type = parsed.success ? parsed.data.type : 'unknown';
  const fresh = await beginWebhookEvent(db, { ...event, type, now });
  if (!fresh) return 'done';

  const paymentId =
    parsed.success && HANDLED_TYPES.has(type) ? parsed.data.data?.paymentId : undefined;
  const result = paymentId ? await syncPayment(db, paymentId, now) : 'ignored';
  if (result === 'retry') return 'retry';
  await finishWebhookEvent(db, { webhookId: event.webhookId, result, now });
  return 'done';
}

/** 결제 하나의 포트원 상태를 주문·예약에 맞춘다. 돌려준 값이 webhook_events.result에 남는다 */
async function syncPayment(db: Db, paymentId: string, now: Date): Promise<string> {
  const order = await readOrderByPaymentId(db, paymentId);
  if (!order) return 'no_order';
  // 결과가 정해진 주문. 정리 작업이 결제 안 함으로 둔 주문은 그 뒤 결제됐을 수 있어 이어서 본다
  const abandoned = order.status === 'failed' && order.failureCode === ABANDONED_ORDER_CODE;
  if (order.status === 'auto_cancelled' || (order.status === 'failed' && !abandoned)) {
    return 'settled';
  }
  if (order.status === 'paid') {
    return (await autoCancelOrder(db, order, now)) ? 'autoCancelled' : 'retry';
  }

  const lookup = await getPortOnePayment(paymentId);
  if (!lookup.ok) return lookup.reason === 'unavailable' ? 'retry' : 'no_payment';
  if (order.status === 'confirmed') {
    const refund = finishedCancellation(lookup.payment);
    return refund ? syncUnrecordedCancel(db, order.orderId, refund, now) : 'settled';
  }
  const applied = await applyPaymentStatus(db, order, lookup.payment, now);
  return applied === 'left' ? 'retry' : applied;
}
