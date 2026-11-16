// 운영자 알림 확인(#373 ⑤)의 건수와 최근 알림. 운영자 화면 위 알림 종(상자)과 알림 확인 화면이 같이 쓴다. 서버에서만 부른다.
// 알림함 기간(최근 NOTIFICATION_INBOX_DAYS일) 안의 보내지 못함·기기 없음 알림만 본다. 받는 사람은 읽지 않는다.

import 'server-only';

import { and, count, desc, gte, inArray, type SQL } from 'drizzle-orm';

import type { getDb } from '@/db';
import { notifications } from '@/db/schema';
import { inboxStart, readNotificationPayload } from '@/server/notifications/inbox-store';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

/** 알림 확인 화면의 두 종류: 보내지 못함 / 기기 없음 */
export const NOTIFICATION_ISSUE_STATUSES = ['failed', 'no_device'] as const;
export type NotificationIssueStatus = (typeof NOTIFICATION_ISSUE_STATUSES)[number];

/** 알림 종 상자의 한 줄 */
export type RecentNotificationIssue = {
  notificationId: string;
  status: NotificationIssueStatus;
  title: string;
  /** ISO */
  createdAt: string;
};

function issuesIn(now: Date): SQL | undefined {
  return and(
    inArray(notifications.status, [...NOTIFICATION_ISSUE_STATUSES]),
    gte(notifications.createdAt, inboxStart(now)),
  );
}

/** 종류마다 건수(알림함 기간 안) */
export async function countNotificationIssues(
  db: DbReader,
  now: Date,
): Promise<Record<NotificationIssueStatus, number>> {
  const rows = await db
    .select({ status: notifications.status, total: count() })
    .from(notifications)
    .where(issuesIn(now))
    .groupBy(notifications.status);
  const counts: Record<NotificationIssueStatus, number> = { failed: 0, no_device: 0 };
  for (const row of rows) {
    if (row.status === 'failed' || row.status === 'no_device') counts[row.status] = row.total;
  }
  return counts;
}

/** 두 종류를 합쳐 최신 limit개(최신 순). 종 상자에 보여 준다 */
export async function selectRecentNotificationIssues(
  db: DbReader,
  input: { now: Date; limit: number },
): Promise<RecentNotificationIssue[]> {
  const rows = await db
    .select({
      notificationId: notifications.id,
      status: notifications.status,
      payload: notifications.payload,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(issuesIn(input.now))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(input.limit);
  return rows.map((row) => ({
    notificationId: row.notificationId,
    // 위 조건으로 두 값만 온다
    status: row.status as NotificationIssueStatus,
    title: readNotificationPayload(row.payload).title,
    createdAt: row.createdAt.toISOString(),
  }));
}
