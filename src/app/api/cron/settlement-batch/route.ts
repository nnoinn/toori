// 목요일 정산 묶기 (X-206, #353, W20 ③). 예약 작업(src/db/cron/settlement-batch.sql)이 매일 새벽 0시 30분(한국 시간)에 부른다.
// 오늘이 지급일(매주 목요일, 공휴일이면 다음 영업일)일 때만 묶고, 아니면 아무것도 하지 않는다. CRON_SECRET이 맞을 때만 실행한다.
// 결제 수수료율(PAYMENT_FEE_RATE)이 정해지기 전(PG 계약 전)에는 묶지 않고 그 이유만 돌려준다.

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { isCronRequest } from '@/server/cron/auth';
import { PAYMENT_FEE_RATE } from '@/server/policy';
import { runSettlementBatch } from '@/server/settlements/batch';

// 샵마다 트랜잭션을 하나씩 돌리므로 넉넉히 둔다. 중간에 끊기면 다음 날 새벽에는 지급일이 아니라서, 그 샵들은 다음 지급일에 묶인다
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isCronRequest(request)) {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  const result = await runSettlementBatch(getDb(), {
    now: await getRequestNow(),
    paymentFeeRate: PAYMENT_FEE_RATE,
  });
  return Response.json(result);
}
