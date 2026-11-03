// 오래된 주문과 진행 중으로 남은 고객 취소 정리 (C-406, W12 ②, W14). 예약 작업(src/db/cron/payments-sweep.sql)이 10분마다 부른다. CRON_SECRET이 맞을 때만 실행한다.

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { isCronRequest } from '@/server/cron/auth';
import { sweepStaleOrders } from '@/server/payments';
import { sweepStaleCancels } from '@/server/refunds';

// 포트원을 한 건씩 부르므로 넉넉히 둔다. 중간에 끊겨도 다음 실행이 이어서 처리한다
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isCronRequest(request)) {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  const db = getDb();
  const now = await getRequestNow();
  // 돈이 이미 움직였을 수 있는 취소를 먼저 본다
  const cancels = await sweepStaleCancels(db, now);
  const orders = await sweepStaleOrders(db, now);
  return Response.json({ orders, cancels });
}
