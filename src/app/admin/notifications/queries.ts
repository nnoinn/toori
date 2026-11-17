// 운영자 알림 확인 화면(#373 ⑤)의 조회. 다시 보내기는 '@/server/admin/notification-resend'가 한다.
// 알림함 기간(최근 NOTIFICATION_INBOX_DAYS일) 안의 보내지 못함·기기 없음 알림만 본다. 받는 사람은 이름만 읽는다(연락처는 읽지 않는다).
// 종류마다 건수는 화면 위 알림 종과 같이 써서 '@/server/admin/notification-issues-store'에 있다.

import 'server-only';

import { and, desc, eq, gte, type SQL, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import { customers, notifications, owners, pushSubscriptions, shops } from '@/db/schema';
import { inboxStart, readNotificationPayload } from '@/server/notifications/inbox-store';

import { ADMIN_PAGE_SIZE, type PageResult, toPage } from '../lookup';
import type { NotificationIssueTab } from './format';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

export type NotificationIssueRow = {
  notificationId: string;
  createdAt: Date;
  accountType: string;
  /** 고객 이름 또는 원장님 샵 이름. 계정을 찾지 못하면 null */
  recipientName: string | null;
  title: string;
  body: string;
  /** 보내지 못함이면 기기마다 결과(쉼표로) */
  error: string | null;
  /** 알림함에서 읽은 시각. 읽었으면 다시 보낼 필요가 적다 */
  readAt: Date | null;
  /** 지금 그 계정의 푸시 알림 기기 수. 0이면 다시 보낼 수 없다 */
  devices: number;
};

function inWindow(now: Date): SQL | undefined {
  return gte(notifications.createdAt, inboxStart(now));
}

/** 종류마다 건수(알림함 기간 안). 화면 위 알림 종과 같이 쓴다 */
export { countNotificationIssues } from '@/server/admin/notification-issues-store';

/** 한 종류의 알림을 최신 순으로 한 쪽(20줄)씩 */
export async function selectNotificationIssues(
  db: DbReader,
  input: { tab: NotificationIssueTab; page: number; now: Date; total: number },
): Promise<PageResult<NotificationIssueRow>> {
  const { page, pageCount, offset } = toPage(input.total, input.page);
  const devices = sql<number>`(
    select count(*)::int from ${pushSubscriptions} p
    where p.user_id = ${notifications.userId} and p.account_type = ${notifications.accountType}
  )`;
  const rows = await db
    .select({
      notificationId: notifications.id,
      createdAt: notifications.createdAt,
      accountType: notifications.accountType,
      customerName: customers.name,
      shopName: shops.name,
      payload: notifications.payload,
      error: notifications.error,
      readAt: notifications.readAt,
      devices,
    })
    .from(notifications)
    .leftJoin(
      customers,
      and(eq(notifications.accountType, 'customer'), eq(customers.userId, notifications.userId)),
    )
    .leftJoin(
      owners,
      and(eq(notifications.accountType, 'owner'), eq(owners.userId, notifications.userId)),
    )
    .leftJoin(shops, eq(shops.ownerId, owners.id))
    .where(and(eq(notifications.status, input.tab), inWindow(input.now)))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(ADMIN_PAGE_SIZE)
    .offset(offset);
  return {
    rows: rows.map(({ customerName, shopName, payload, ...row }) => {
      const { title, body } = readNotificationPayload(payload);
      return { ...row, recipientName: customerName ?? shopName ?? null, title, body };
    }),
    total: input.total,
    page,
    pageCount,
  };
}
