// 예약 리마인드 (C-602, W17 ①). 예약 작업(src/db/cron/reminders.sql)이 5분마다 부른다. CRON_SECRET이 맞을 때만 실행한다.

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { isCronRequest } from '@/server/cron/auth';
import { sendDueReminders } from '@/server/notifications';

// 푸시를 여러 건 보내므로 넉넉히 둔다. 중간에 끊겨도 다음 실행이 남은 것을 보낸다
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isCronRequest(request)) {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  const reminders = await sendDueReminders(getDb(), await getRequestNow());
  return Response.json({ reminders });
}
