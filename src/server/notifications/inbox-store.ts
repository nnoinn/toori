// 알림함(#371) 읽기·저장. 서버에서만 부른다. 늘 받는 사람(user_id)과 계정 종류(account_type)로만 찾는다(X-102, NOTI-07).
// 알림함 인덱스(user_id, account_type, created_at, id) 순서로 찾는다.

import 'server-only';

import { and, desc, eq, gt, gte, inArray, isNull, lt, type SQL, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import { type AccountType, notifications } from '@/db/schema';
import { addHours } from '@/lib/time';
import { NOTIFICATION_INBOX_DAYS } from '@/server/policy';

import type { MyNotification } from './inbox-types';

type Db = ReturnType<typeof getDb>;
type DbReader = Pick<Db, 'select'>;

/** 누구의 알림함인지와 보여 주는 기간의 시작(최근 NOTIFICATION_INBOX_DAYS일) */
export type InboxOwner = { userId: string; accountType: AccountType; from: Date };

/** 알림함이 보여 주는 기간의 시작. 이보다 먼저 만든 알림은 보여 주지 않고 매일 정리 작업이 지운다 */
export function inboxStart(now: Date): Date {
  return addHours(now, -NOTIFICATION_INBOX_DAYS * 24);
}

const INBOX_COLUMNS = {
  id: notifications.id,
  payload: notifications.payload,
  createdAt: notifications.createdAt,
  readAt: notifications.readAt,
};

type InboxRow = { id: string; payload: unknown; createdAt: Date; readAt: Date | null };

/** 알림 내용(payload: { title, body, url })을 읽는다. 없는 값은 빈 글자로 둔다 */
export function readNotificationPayload(payload: unknown): {
  title: string;
  body: string;
  url: string;
} {
  const value =
    typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
  const text = (item: unknown) => (typeof item === 'string' ? item : '');
  return { title: text(value.title), body: text(value.body), url: text(value.url) };
}

/** 알림 한 줄을 알림함 모양으로 */
export function toMyNotification(row: InboxRow): MyNotification {
  return {
    id: row.id,
    ...readNotificationPayload(row.payload),
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt ? row.readAt.toISOString() : null,
  };
}

/** 이 계정의 최근 기간 알림 */
function mine(owner: InboxOwner): SQL | undefined {
  return and(
    eq(notifications.userId, owner.userId),
    eq(notifications.accountType, owner.accountType),
    gte(notifications.createdAt, owner.from),
  );
}

/**
 * 알림함 한 쪽: 최신 순(만든 시각, 같으면 id). afterId가 있으면 그 알림 다음부터다.
 * 다음 쪽의 기준은 알림 id이고, 그 알림의 만든 시각은 DB에서 읽는다. 화면에 넘긴 시각(밀리초)으로 비교하면
 * DB 시각(마이크로초)과 달라 같은 알림이 다시 나오거나 같은 시각의 알림이 빠질 수 있어서다.
 * 기준 알림이 이 계정의 것이 아니거나 이미 지워졌으면 빈 쪽이다
 */
export async function selectInboxPage(
  db: DbReader,
  owner: InboxOwner,
  input: { afterId: string | null; limit: number },
): Promise<MyNotification[]> {
  const after =
    input.afterId === null
      ? undefined
      : sql`(${notifications.createdAt}, ${notifications.id}) < (
          select c.created_at, c.id from ${notifications} c
          where c.id = ${input.afterId} and c.user_id = ${owner.userId} and c.account_type = ${owner.accountType}
        )`;
  const rows = await db
    .select(INBOX_COLUMNS)
    .from(notifications)
    .where(and(mine(owner), after))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(input.limit);
  return rows.map(toMyNotification);
}

/** 안 읽은 알림 수(최근 기간) */
export async function countUnreadInbox(db: DbReader, owner: InboxOwner): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(mine(owner), isNull(notifications.readAt)));
  return row?.count ?? 0;
}

/** 읽음으로 바꾼다. 이미 읽은 것·다른 계정의 것·없는 id는 건너뛰고 바꾼 수를 돌려준다 */
export async function markInboxRead(
  db: Pick<Db, 'update'>,
  owner: InboxOwner,
  target: { ids: string[] } | { all: true },
  now: Date,
): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ readAt: now })
    .where(
      and(
        mine(owner),
        isNull(notifications.readAt),
        'ids' in target ? inArray(notifications.id, target.ids) : undefined,
      ),
    )
    .returning({ id: notifications.id });
  return rows.length;
}

/** after 뒤에 생긴 알림 중 최신 limit개를 오래된 순으로(화면 안내용) */
export async function selectInboxSince(
  db: DbReader,
  owner: InboxOwner,
  input: { after: Date; limit: number },
): Promise<MyNotification[]> {
  const rows = await db
    .select(INBOX_COLUMNS)
    .from(notifications)
    .where(and(mine(owner), gt(notifications.createdAt, input.after)))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(input.limit);
  return rows.reverse().map(toMyNotification);
}

/** before보다 먼저 만든 알림을 모두 지운다(최근 NOTIFICATION_INBOX_DAYS일만 둔다, #371). 지운 수를 돌려준다 */
export async function deleteExpiredNotifications(
  db: Pick<Db, 'delete'>,
  before: Date,
): Promise<number> {
  const rows = await db
    .delete(notifications)
    .where(lt(notifications.createdAt, before))
    .returning({ id: notifications.id });
  return rows.length;
}
