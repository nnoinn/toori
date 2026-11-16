'use server';

// 알림함 함수 (#371, 11/13 nnoinn 결정. 모양은 #443 고객 알림함과 맞춤). 고객 화면(정찬형)과 원장님 화면(정민석)이 부른다.
// 모두 지금 계정 모드 기준이다(X-102, NOTI-07). 고객 화면은 계정 종류를 넘기지 않고(기본 'customer'), 원장님 화면은 'owner'를 넘긴다.
// 최근 NOTIFICATION_INBOX_DAYS일만 보여 주고, 그보다 오래된 알림은 매일 새 매물 알림 작업이 끝날 때 지운다(digest.ts).
// 알림은 푸시 알림을 켠 기기가 없어도 늘 기록된다(notify.ts, NOTI-05).

import { z } from 'zod';

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { fail, ok, type Result } from '@/lib/result';
import { requireCustomer, requireOwner } from '@/server/auth';

import {
  countUnreadInbox,
  type InboxOwner,
  inboxStart,
  markInboxRead,
  selectInboxPage,
  selectInboxSince,
} from './inbox-store';
import {
  type MyNotification,
  NOTIFICATION_ACCOUNTS,
  type NotificationAccount,
  NOTIFICATIONS_PAGE_MAX,
  NOTIFICATIONS_PAGE_SIZE,
  NOTIFICATIONS_SINCE_OVERLAP_SECONDS,
} from './inbox-types';

const INVALID_INPUT = fail('INVALID_INPUT', '요청을 확인하지 못했어요. 다시 시도해 주세요');

const accountSchema = z.enum(NOTIFICATION_ACCOUNTS);

const listInputSchema = z
  .object({
    // 다음 쪽 기준(지난 결과의 nextCursor). 알림 id다
    cursor: z.uuid().optional(),
    limit: z.number().int().min(1).max(NOTIFICATIONS_PAGE_MAX).optional(),
  })
  .optional();

const markInputSchema = z.union([
  z.object({
    ids: z
      .array(z.uuid())
      .min(1)
      .max(NOTIFICATIONS_PAGE_MAX * 2),
  }),
  z.object({ all: z.literal(true) }),
]);

const sinceSchema = z.iso.datetime({ offset: true });

type Inbox = InboxOwner & { now: Date };

/** 지금 계정 모드가 그 계정 종류일 때 알림함 주인과 지금 시각. 로그인 안 함·다른 모드·계정 없음이면 그 실패 */
async function openInbox(account: NotificationAccount): Promise<Result<Inbox>> {
  const auth = account === 'owner' ? await requireOwner() : await requireCustomer();
  if (!auth.ok) return auth;
  const now = await getRequestNow();
  return ok({ userId: auth.data.userId, accountType: account, from: inboxStart(now), now });
}

/** 알림함: 최근 90일, 최신 순, limit개씩(기본 20). 다음 쪽은 nextCursor로 */
export async function listMyNotifications(
  input?: { cursor?: string; limit?: number },
  account: NotificationAccount = 'customer',
): Promise<Result<{ items: MyNotification[]; nextCursor: string | null; serverNow: string }>> {
  const parsed = listInputSchema.safeParse(input);
  const kind = accountSchema.safeParse(account);
  if (!parsed.success || !kind.success) return INVALID_INPUT;
  const inbox = await openInbox(kind.data);
  if (!inbox.ok) return inbox;
  const limit = parsed.data?.limit ?? NOTIFICATIONS_PAGE_SIZE;
  // 하나 더 읽어서 다음 쪽이 있는지 안다
  const rows = await selectInboxPage(getDb(), inbox.data, {
    afterId: parsed.data?.cursor ?? null,
    limit: limit + 1,
  });
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return ok({
    items,
    nextCursor: rows.length > limit && last ? last.id : null,
    serverNow: inbox.data.now.toISOString(),
  });
}

/** 종의 안 읽은 수. 로그인 안 함·지금 계정이 그 계정 종류가 아님·계정 없음이면 null(종을 숨긴다) */
export async function countMyUnreadNotifications(
  account: NotificationAccount = 'customer',
): Promise<Result<number | null>> {
  const kind = accountSchema.safeParse(account);
  if (!kind.success) return INVALID_INPUT;
  const inbox = await openInbox(kind.data);
  if (!inbox.ok) return ok(null);
  return ok(await countUnreadInbox(getDb(), inbox.data));
}

/** 읽음으로. 줄을 누를 때 { ids: [id] }, [모두 읽음]은 { all: true }. 이미 읽은 것·다른 계정의 것·없는 것은 건너뛴다 */
export async function markNotificationsRead(
  input: { ids: string[] } | { all: true },
  account: NotificationAccount = 'customer',
): Promise<Result<{ count: number }>> {
  const parsed = markInputSchema.safeParse(input);
  const kind = accountSchema.safeParse(account);
  if (!parsed.success || !kind.success) return INVALID_INPUT;
  const inbox = await openInbox(kind.data);
  if (!inbox.ok) return inbox;
  return ok({ count: await markInboxRead(getDb(), inbox.data, parsed.data, inbox.data.now) });
}

/**
 * 화면 안내용(1분마다): since 뒤에 생긴 알림(최신 NOTIFICATIONS_PAGE_SIZE개, 오래된 순). since는 지난번 결과의 serverNow다.
 * 놓치지 않으려고 since보다 NOTIFICATIONS_SINCE_OVERLAP_SECONDS초 앞부터 돌려줘서, 지난번에 받은 알림이 다시 올 수 있다(id로 거른다)
 */
export async function listMyNotificationsSince(
  since: string,
  account: NotificationAccount = 'customer',
): Promise<Result<{ items: MyNotification[]; serverNow: string }>> {
  const parsed = sinceSchema.safeParse(since);
  const kind = accountSchema.safeParse(account);
  if (!parsed.success || !kind.success) return INVALID_INPUT;
  const inbox = await openInbox(kind.data);
  if (!inbox.ok) return inbox;
  const after = new Date(Date.parse(parsed.data) - NOTIFICATIONS_SINCE_OVERLAP_SECONDS * 1000);
  const items = await selectInboxSince(getDb(), inbox.data, {
    after,
    limit: NOTIFICATIONS_PAGE_SIZE,
  });
  return ok({ items, serverNow: inbox.data.now.toISOString() });
}
