// 관심 동네·찜한 샵 새 매물 알림 (C-601·C-209, W17 ②). 예약 작업(src/db/cron/slot-digest.sql)이 매일 오후 1시에 부른다.
// CRON_SECRET이 맞을 때만 실행한다. 보내기가 끝나면 쓰이지 않는 사업자등록증을 지운다(#478, 30일)

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { recordCronRun } from '@/server/cron/run-log';
import { isCronRequest } from '@/server/cron/auth';
import { sendSlotDigest } from '@/server/notifications';
import { cleanUpBusinessDocs } from '@/server/storage/business-doc-cleanup';

// 고객마다 매물을 찾고 푸시를 보내므로 넉넉히 둔다
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isCronRequest(request)) {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  const db = getDb();
  const now = await getRequestNow();
  // 실행 기록을 남긴다(#373 ⑥). 결과는 보낸 개수와 지운 등록증 수다
  const result = await recordCronRun(db, 'slot-digest', now, async () => ({
    digest: await sendSlotDigest(db, now),
    // 알림을 보낸 뒤에 한다. 실패해도 던지지 않고 결과에 남긴다
    businessDocs: await cleanUpBusinessDocs(db, now),
  }));
  return Response.json(result);
}
