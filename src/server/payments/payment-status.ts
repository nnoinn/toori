// 포트원에서 확인한 결제 상태를 결제 대기 주문에 반영한다 (X-201, W12, W13). 서버에서만 부른다. 정리 작업과 웹훅이 같이 쓴다.

import 'server-only';

import type { getDb } from '@/db';

import type { PortOnePayment } from './portone';
import { recordFailedPayment, settlePaidOrder } from './settle-order';

type Db = ReturnType<typeof getDb>;

/** left: 결제가 아직 진행 중이거나, 확정하지 못한 결제의 취소를 끝내지 못해 다시 봐야 한다 */
export type AppliedPayment = 'confirmed' | 'autoCancelled' | 'failed' | 'left';

export async function applyPaymentStatus(
  db: Db,
  order: { orderId: string; paymentId: string; amount: number },
  payment: PortOnePayment,
  now: Date,
): Promise<AppliedPayment> {
  switch (payment.status) {
    case 'PAID': {
      const settled = await settlePaidOrder(db, order, payment, now);
      if (settled.ok) return 'confirmed';
      return settled.autoCancelled ? 'autoCancelled' : 'left';
    }
    case 'FAILED':
    case 'CANCELLED':
    case 'PARTIAL_CANCELLED':
      await recordFailedPayment(db, order.orderId, payment);
      return 'failed';
    case 'READY':
    case 'PENDING':
    case 'VIRTUAL_ACCOUNT_ISSUED':
      return 'left';
    default:
      console.error('[payments] 알 수 없는 포트원 결제 상태:', payment.status);
      return 'left';
  }
}
