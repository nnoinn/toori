// 진행 중으로 남은 고객 취소 정리 (W14, #222). 서버에서만 부른다. 예약 작업(/api/cron/payments-sweep)이 부른다.
// 취소 요청이 포트원 환불 전후로 멈추면 진행 중(requested) 기록이 남는다. 고객이 다시 누르지 않아도 여기서 끝낸다.
// 다시 불러도 같은 결과라서, 실행이 겹치거나 중간에 끊겨도 다음 실행이 이어서 처리한다.

import 'server-only';

import type { getDb } from '@/db';
import { ORDER_SWEEP_BATCH, STALE_CANCEL_MINUTES } from '@/server/policy';

import { type SettleResult, settleRequestedCancel } from './finish-cancel';
import { readStaleCancels } from './refund-store';

export type CancelSweepSummary = { checked: number } & Record<SettleResult, number>;

/** 오래된 진행 중 취소를 한 번에 ORDER_SWEEP_BATCH건까지 처리하고 결과 개수를 돌려준다. 한 건이 실패해도 나머지는 계속한다 */
export async function sweepStaleCancels(
  db: ReturnType<typeof getDb>,
  now: Date,
): Promise<CancelSweepSummary> {
  const requestedBefore = new Date(now.getTime() - STALE_CANCEL_MINUTES * 60 * 1000);
  const stale = await readStaleCancels(db, { requestedBefore, limit: ORDER_SWEEP_BATCH });
  const summary: CancelSweepSummary = { checked: stale.length, finished: 0, cleared: 0, left: 0 };
  for (const request of stale) {
    try {
      summary[await settleRequestedCancel(db, request, now)] += 1;
    } catch (error) {
      console.error(
        '[cancel] 취소 정리 실패:',
        request.reservationId,
        error instanceof Error ? error.name : 'unknown',
      );
      summary.left += 1;
    }
  }
  return summary;
}
