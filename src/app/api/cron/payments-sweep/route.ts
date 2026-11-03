// 오래된 주문 정리 (C-406, W12 ②). 예약 작업(src/db/cron/payments-sweep.sql)이 10분마다 부른다. CRON_SECRET이 맞을 때만 실행한다.

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { isCronRequest } from '@/server/cron/auth';
import { sweepStaleOrders } from '@/server/payments';

// 포트원을 한 건씩 부르므로 넉넉히 둔다. 중간에 끊겨도 다음 실행이 이어서 처리한다
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isCronRequest(request)) {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  return Response.json(await sweepStaleOrders(getDb(), await getRequestNow()));
}
