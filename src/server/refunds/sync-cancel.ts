// 우리 기록에 없는 포트원 취소를 예약에 맞춘다 (X-204, W13, #222). 웹훅이 부른다. 서버에서만 부른다.
// 포트원이 거절로 답한 뒤 나중에 처리했거나 콘솔에서 직접 취소하면, 돈은 돌아갔는데 예약은 '예정'으로 남는다.
// 원장님이 오지 않을 손님을 기다리지 않도록 실제 환불액으로 취소를 끝내고 운영자 확인 이유를 남긴다.

import 'server-only';

import type { getDb } from '@/db';

import { calcRefund } from './calc-refund';
import { finishCancel } from './finish-cancel';
import { readRefundTargetByOrder } from './refund-store';

type Db = ReturnType<typeof getDb>;

const UNRECORDED_CANCEL_REASON = '우리가 시작하지 않았거나 나중에 처리된 포트원 취소예요';

/**
 * cancel_recorded: 취소를 기록했다. cancel_known: 이미 기록했거나 바꾸지 않는다.
 * retry: 진행 중인 취소가 있다. 앞선 요청이나 정리 작업이 끝낼 텐데, 기록이 지워질 수도 있어서 포트원이 다시 보내게 한다
 */
export type CancelSync = 'cancel_recorded' | 'cancel_known' | 'retry';

export async function syncUnrecordedCancel(
  db: Db,
  orderId: string,
  refund: { cancellationId: string | null; amount: number | null },
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

  const calc = calcRefund({
    paidAmount: target.paidAmount,
    salePrice: target.salePrice,
    startAt: target.startAt,
    now,
  });
  if (calc.band === null) throw new Error('고객 취소에는 위약금 구간이 있어야 해요');
  console.error('[cancel] 우리 기록에 없는 포트원 취소를 반영해요:', target.reservationId);
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
    UNRECORDED_CANCEL_REASON,
  );
  return finished ? 'cancel_recorded' : 'cancel_known';
}
