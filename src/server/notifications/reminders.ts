// 예약 리마인드 보내기 (C-602, W17 ①, #131). 예약 작업(/api/cron/reminders)이 5분마다 부른다.
// 거래 알림이라 밤 시간 제한이 없고 종류별로 끄지 않는다(#283). 고객에게만 보낸다.

import 'server-only';

import type { getDb } from '@/db';
import { formatKst, formatKstTime } from '@/lib/time';
import { REMINDER_MINUTES_BEFORE } from '@/server/policy';

import { notify } from './notify';
import { type DueReminder, readDueReminders, reminderDedupeKey } from './reminder-store';

type Db = ReturnType<typeof getDb>;

const EVENT = 'reservation.reminder';
/** 한 번 실행에서 리마인드 종류마다 볼 예약 수. 남은 것은 다음 실행(5분 뒤)이 이어서 보낸다 */
const REMINDER_BATCH = 200;
/** 동시에 보내는 수 */
const SEND_CONCURRENCY = 10;

export type ReminderSummary = { due: number; failed: number };

/** 리마인드 문구. 2시간 전은 날짜까지, 15분 전처럼 1시간 안쪽은 시각만 쓴다 */
export function reminderMessage(
  minutes: number,
  reminder: Pick<DueReminder, 'shopName' | 'startAt'>,
) {
  const left = minutes % 60 === 0 ? `${minutes / 60}시간` : `${minutes}분`;
  return {
    title: `예약 ${left} 전이에요`,
    body:
      minutes >= 60
        ? `${reminder.shopName} · ${formatKst(reminder.startAt)}`
        : `${reminder.shopName} · ${formatKstTime(reminder.startAt)} 시작`,
  };
}

/**
 * 지금 보낼 리마인드를 모두 보낸다. 긴 것(2시간 전)부터 본다.
 * 한 건이 실패해도 나머지는 보내고, 실패한 수만 돌려준다(같은 리마인드는 다시 보내지 않는다)
 */
export async function sendDueReminders(db: Db, now: Date): Promise<ReminderSummary> {
  const offsets = [...REMINDER_MINUTES_BEFORE].sort((a, b) => b - a);
  const summary: ReminderSummary = { due: 0, failed: 0 };
  for (const [index, minutes] of offsets.entries()) {
    const due = await readDueReminders(db, {
      minutes,
      nextMinutes: offsets[index + 1] ?? 0,
      now,
      limit: REMINDER_BATCH,
    });
    summary.due += due.length;
    for (let start = 0; start < due.length; start += SEND_CONCURRENCY) {
      const results = await Promise.allSettled(
        due.slice(start, start + SEND_CONCURRENCY).map((reminder) =>
          notify(db, {
            userId: reminder.customerUserId,
            accountType: 'customer',
            event: EVENT,
            dedupeKey: reminderDedupeKey(minutes, reminder.reservationId),
            ...reminderMessage(minutes, reminder),
            url: `/reservations/${reminder.reservationId}`,
          }),
        ),
      );
      for (const result of results) {
        if (result.status === 'fulfilled') continue;
        summary.failed += 1;
        console.error(
          '[notify] 리마인드 실패:',
          result.reason instanceof Error ? result.reason.name : 'unknown',
        );
      }
    }
  }
  return summary;
}
