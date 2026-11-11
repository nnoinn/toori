// 관심 동네·찜한 샵 새 매물 알림 (C-601·C-209, W17 ②). 예약 작업(src/db/cron/slot-digest.sql)이 매일 오후 1시에 부른다.
// CRON_SECRET이 맞을 때만 실행한다.

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { isCronRequest } from '@/server/cron/auth';
import { sendSlotDigest } from '@/server/notifications';

// 고객마다 매물을 찾고 푸시를 보내므로 넉넉히 둔다
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isCronRequest(request)) {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  const digest = await sendSlotDigest(getDb(), await getRequestNow());
  return Response.json({ digest });
}
