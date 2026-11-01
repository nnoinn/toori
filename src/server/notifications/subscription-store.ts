// 웹 푸시 구독 저장 (연결 #12, #131, X-505-1). 서버에서만 부른다.
// 구독은 기기(endpoint)마다 하나이고, 어느 계정(고객/원장님)의 알림을 받는지 같이 저장한다.
// 같은 기기로 다시 구독하면 덮어쓴다(마지막에 구독한 계정의 알림만 받는다, endpoint unique).

import 'server-only';

import { and, eq } from 'drizzle-orm';

import type { getDb } from '@/db';
import type { AccountType } from '@/db/schema/accounts';
import { pushSubscriptions } from '@/db/schema';

type Db = Pick<ReturnType<typeof getDb>, 'insert' | 'delete'>;

export type NewPushSubscription = {
  userId: string;
  accountType: AccountType;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
};

/** 구독을 저장한다. 같은 기기(endpoint)가 이미 있으면 계정·키·기기 정보를 새 값으로 바꾼다 */
export async function upsertPushSubscription(db: Db, input: NewPushSubscription): Promise<void> {
  const { userId, accountType, p256dh, auth, userAgent } = input;
  await db.insert(pushSubscriptions).values(input).onConflictDoUpdate({
    target: pushSubscriptions.endpoint,
    set: { userId, accountType, p256dh, auth, userAgent },
  });
}

/** 내 구독만 지운다. 지웠으면 true */
export async function deletePushSubscription(
  db: Db,
  input: { userId: string; endpoint: string },
): Promise<boolean> {
  const deleted = await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, input.endpoint),
        eq(pushSubscriptions.userId, input.userId),
      ),
    )
    .returning({ id: pushSubscriptions.id });
  return deleted.length > 0;
}
