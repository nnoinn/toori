// 오래된 주문과 진행 중으로 남은 고객 취소 정리 (C-406, W12 ②, W14), 결제 없이 홀딩이 끝난 시간대 칸 닫기(#308 ③).
// 예약 작업(src/db/cron/payments-sweep.sql)이 10분마다 부른다. CRON_SECRET이 맞을 때만 실행한다.

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { isCronRequest } from '@/server/cron/auth';
import { notifyKeptWindowSlotsReleased } from '@/server/notifications/alerts';
import { sweepStaleOrders } from '@/server/payments';
import { sweepStaleCancels } from '@/server/refunds';
import { closeStaleWindowHolds } from '@/server/slot-windows';

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
  // 결제 대기 주문의 결과가 정해진 뒤에 닫아야 해서 주문 정리 다음에 한다
  const closed = await closeStaleWindowHolds(db, { now });
  // 원장님이 마감할 때 결제 중이라 남긴 칸이 닫혔으면 알린다(그런 칸만 고른다, #308 ③-2)
  notifyKeptWindowSlotsReleased(
    db,
    closed.map((slot) => slot.slotId),
  );
  return Response.json({ orders, cancels, windowHolds: closed.length });
}
