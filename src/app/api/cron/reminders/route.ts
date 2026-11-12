// 예약 리마인드 (C-602, W17 ①)와 합의 후 취소 요청 정리(X-208, #320). 예약 작업(src/db/cron/reminders.sql)이 5분마다 부른다.
// CRON_SECRET이 맞을 때만 실행한다. 합의 후 취소 정리는 만료 알림을 보내야 해서 같은 5분 작업에 붙였다(새 예약 작업 등록 없이).

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { isCronRequest } from '@/server/cron/auth';
import { sendDueReminders } from '@/server/notifications';
import { sweepAgreedCancelRequests } from '@/server/refunds';

// 푸시를 여러 건 보내므로 넉넉히 둔다. 중간에 끊겨도 다음 실행이 남은 것을 보낸다
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isCronRequest(request)) {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  const db = getDb();
  const now = await getRequestNow();
  const reminders = await sendDueReminders(db, now);
  const agreedCancels = await sweepAgreedCancelRequests(db, now);
  return Response.json({ reminders, agreedCancels });
}
