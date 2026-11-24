// 관심 동네·찜한 샵 새 매물 알림 (C-601·C-209, W17 ②). 예약 작업(src/db/cron/slot-digest.sql)이 매일 오후 1시에 부른다.
// CRON_SECRET이 맞을 때만 실행한다. 보내기가 끝나면 쓰이지 않는 사업자등록증을 지운다(#478, 30일).
// 그다음 2년마다 광고성 정보 수신 동의 확인 알림을 보내고(#535), 마지막으로 탈퇴하고 30일이 지난 계정의 개인정보를 지운다(#154 본문 4장, 11/24).
// 둘 다 하루 한 번이면 되는 일이라 이 작업에 붙였다

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { eraseWithdrawnAccounts } from '@/server/accounts/withdrawal-erase';
import { recordCronRun } from '@/server/cron/run-log';
import { isCronRequest } from '@/server/cron/auth';
import { sendConsentRechecks, sendSlotDigest } from '@/server/notifications';
import { cleanUpBusinessDocs } from '@/server/storage/business-doc-cleanup';

// 고객마다 매물을 찾고 푸시를 보내므로 넉넉히 둔다
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isCronRequest(request)) {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  const db = getDb();
  const now = await getRequestNow();
  // 실행 기록을 남긴다(#373 ⑥). 결과는 보낸 개수, 지운 등록증 수, 보낸 동의 확인 수, 개인정보를 지운 탈퇴 계정 수다
  const result = await recordCronRun(db, 'slot-digest', now, async () => ({
    digest: await sendSlotDigest(db, now),
    // 알림을 보낸 뒤에 한다. 실패해도 던지지 않고 결과에 남긴다
    businessDocs: await cleanUpBusinessDocs(db, now),
    // 동의를 읽다 실패하면 던져서 실행 기록에 실패로 남는다(앞의 두 일은 이미 끝났고, 탈퇴 지우기는 다음 날 한다)
    consentRecheck: await sendConsentRechecks(db, now),
    // 맨 뒤에 둔다. 탈퇴 기록을 읽다 실패하면 던져서 실행 기록에 실패로 남지만, 앞의 일들은 이미 끝났다
    withdrawalErase: await eraseWithdrawnAccounts(db, now),
  }));
  return Response.json(result);
}
