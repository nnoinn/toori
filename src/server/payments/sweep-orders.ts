// 오래된 주문 정리 (C-406, W12 ②). 서버에서만 부른다. 예약 작업(/api/cron/payments-sweep)이 10분마다 부른다.
// 결제 대기로 남은 주문은 포트원에 물어 결과를 정한다. 결제하고 창을 닫아 결제 확인이 불리지 않은 주문도 여기서 예약을 확정하거나 자동 취소한다.
// 확정하지 못했는데 취소를 끝내지 못한 주문(paid)은 취소를 다시 시도한다.
// 모두 다시 불러도 같은 결과라서, 실행이 겹치거나 중간에 끊겨도 다음 실행이 이어서 처리한다.

import 'server-only';

import type { getDb } from '@/db';
import { ORDER_SWEEP_BATCH, STALE_ORDER_MINUTES } from '@/server/policy';

import { recordOrderOutcome } from './confirm-store';
import { ABANDONED_ORDER_CODE } from './errors';
import { readStaleOrders, type StaleOrder } from './order-store';
import { getPortOnePayment } from './portone';
import { autoCancelOrder, recordFailedPayment, settlePaidOrder } from './settle-order';

type Db = ReturnType<typeof getDb>;

/** 주문 하나의 결과. left: 이번에는 정하지 못해 다음 실행이 다시 본다 */
type SweepResult = 'confirmed' | 'autoCancelled' | 'failed' | 'abandoned' | 'left';

export type SweepSummary = { checked: number } & Record<SweepResult, number>;

/** 오래된 주문을 한 번에 ORDER_SWEEP_BATCH건까지 처리하고 결과 개수를 돌려준다. 한 건이 실패해도 나머지를 계속한다 */
export async function sweepStaleOrders(db: Db, now: Date): Promise<SweepSummary> {
  const createdBefore = new Date(now.getTime() - STALE_ORDER_MINUTES * 60 * 1000);
  const stale = await readStaleOrders(db, { createdBefore, limit: ORDER_SWEEP_BATCH });
  const summary: SweepSummary = {
    checked: stale.length,
    confirmed: 0,
    autoCancelled: 0,
    failed: 0,
    abandoned: 0,
    left: 0,
  };
  for (const order of stale) {
    try {
      summary[await sweepOrder(db, order, now)] += 1;
    } catch (error) {
      console.error(
        '[payments] 주문 정리 실패:',
        order.orderId,
        error instanceof Error ? error.name : 'unknown',
      );
      summary.left += 1;
    }
  }
  return summary;
}

async function sweepOrder(db: Db, order: StaleOrder, now: Date): Promise<SweepResult> {
  if (order.status === 'paid') {
    return (await autoCancelOrder(db, order, now)) ? 'autoCancelled' : 'left';
  }

  const lookup = await getPortOnePayment(order.paymentId);
  if (!lookup.ok) {
    if (lookup.reason === 'unavailable') return 'left';
    // 결제창까지 가지 않았다
    await recordAbandoned(db, order.orderId, 'NOT_FOUND');
    return 'abandoned';
  }
  const payment = lookup.payment;
  switch (payment.status) {
    case 'PAID': {
      const settled = await settlePaidOrder(db, order, payment, now);
      if (settled.ok) return 'confirmed';
      return settled.autoCancelled ? 'autoCancelled' : 'left';
    }
    case 'READY':
      // 결제창에서 결제하지 않았다
      await recordAbandoned(db, order.orderId, payment.status);
      return 'abandoned';
    case 'FAILED':
    case 'CANCELLED':
    case 'PARTIAL_CANCELLED':
      await recordFailedPayment(db, order.orderId, payment);
      return 'failed';
    case 'PENDING':
    case 'VIRTUAL_ACCOUNT_ISSUED':
      return 'left';
    default:
      console.error('[payments] 알 수 없는 포트원 결제 상태:', payment.status);
      return 'left';
  }
}

function recordAbandoned(db: Db, orderId: string, pgStatus: string) {
  return recordOrderOutcome(db, orderId, {
    status: 'failed',
    pgStatus,
    failureCode: ABANDONED_ORDER_CODE,
  });
}
