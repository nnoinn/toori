// 웹 푸시 구독 저장 (연결 #12, #131, X-505-1). 서버에서만 부른다.
// 구독은 기기(endpoint)+계정 종류(고객/원장님)마다 하나다. 한 기기에서 켜 둔 계정의 알림을 모두 받는다(11/1 결정, 기술 가이드 7장).

import 'server-only';

import { and, eq, ne } from 'drizzle-orm';

import type { getDb } from '@/db';
import type { AccountType } from '@/db/schema/accounts';
import { pushSubscriptions } from '@/db/schema';

type Db = Pick<ReturnType<typeof getDb>, 'select' | 'insert' | 'delete'>;

export type NewPushSubscription = {
  userId: string;
  accountType: AccountType;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
};

/** 어느 기기의 어느 계정 구독인지 */
type SubscriptionKey = { userId: string; accountType: AccountType; endpoint: string };

/**
 * 구독을 저장한다. 같은 기기·같은 계정 종류면 키·기기 정보를 새 값으로 바꾸고, 같은 로그인의 다른 계정 구독은 그대로 둔다.
 * 같은 기기에 다른 로그인의 구독이 있으면 지운다(공용 기기에서 남의 알림을 받지 않게). 함께 저장되도록 트랜잭션 안에서 부른다
 */
export async function upsertPushSubscription(tx: Db, input: NewPushSubscription): Promise<void> {
  const { userId, endpoint, p256dh, auth, userAgent } = input;
  await tx
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), ne(pushSubscriptions.userId, userId)));
  await tx
    .insert(pushSubscriptions)
    .values(input)
    .onConflictDoUpdate({
      target: [pushSubscriptions.endpoint, pushSubscriptions.accountType],
      set: { userId, p256dh, auth, userAgent },
    });
}

/** 이 기기에서 그 계정 종류의 내 구독만 지운다(알림 끄기). 지웠으면 true */
export async function deletePushSubscription(db: Db, key: SubscriptionKey): Promise<boolean> {
  const deleted = await db
    .delete(pushSubscriptions)
    .where(subscriptionIs(key))
    .returning({ id: pushSubscriptions.id });
  return deleted.length > 0;
}

/** 이 기기의 내 구독을 계정 종류와 상관없이 모두 지운다(로그아웃). 지운 개수를 돌려준다 */
export async function deleteDevicePushSubscriptions(
  db: Db,
  input: { userId: string; endpoint: string },
): Promise<number> {
  const deleted = await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, input.endpoint),
        eq(pushSubscriptions.userId, input.userId),
      ),
    )
    .returning({ id: pushSubscriptions.id });
  return deleted.length;
}

/** 이 기기에 그 계정 종류의 내 구독이 있는지 */
export async function hasPushSubscription(
  db: Pick<Db, 'select'>,
  key: SubscriptionKey,
): Promise<boolean> {
  const rows = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(subscriptionIs(key))
    .limit(1);
  return rows.length > 0;
}

function subscriptionIs({ userId, accountType, endpoint }: SubscriptionKey) {
  return and(
    eq(pushSubscriptions.endpoint, endpoint),
    eq(pushSubscriptions.accountType, accountType),
    eq(pushSubscriptions.userId, userId),
  );
}

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

/** 그 계정 종류의 구독을 기기마다 읽는다(notify). 켜 둔 기기가 없으면 빈 목록 */
export async function readPushTargets(
  db: Pick<Db, 'select'>,
  input: { userId: string; accountType: AccountType },
): Promise<PushTarget[]> {
  return db
    .select({
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, input.userId),
        eq(pushSubscriptions.accountType, input.accountType),
      ),
    );
}

/** 끝난 구독(푸시 서버가 404·410으로 답함)을 지운다. 브라우저 구독은 두 계정이 같이 쓰므로 계정 종류와 상관없이 지운다 */
export async function deleteExpiredPushSubscription(db: Db, endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}
