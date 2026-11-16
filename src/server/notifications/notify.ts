// 알림 기록과 보내기 (X-505-1, 연결 #12, #131, 알림함 #371). 서버에서만 부른다. 일이 일어난 곳의 서버 함수가 alerts.ts의 이벤트별 함수로 부른다.
// 지금 채널은 웹 푸시 하나이고, 앱 단계에서 앱 푸시를 이 함수에 더한다.

import 'server-only';

import { eq } from 'drizzle-orm';

import type { getDb } from '@/db';
import { type AccountType, notifications } from '@/db/schema';

import { type PushResult, sendWebPush } from './send-web-push';
import {
  deleteExpiredPushSubscription,
  type PushTarget,
  readPushTargets,
} from './subscription-store';

type Db = ReturnType<typeof getDb>;

export type NewNotification = {
  userId: string;
  accountType: AccountType;
  /** 예: reservation.confirmed */
  event: string;
  /** 같은 값으로는 한 번만 보낸다. 예: reservation.confirmed:customer:예약ID */
  dedupeKey: string;
  title: string;
  body: string;
  /** 알림을 누르면 열 주소 */
  url: string;
};

/**
 * 푸시 알림을 켜 둔 기기마다 보내고, 끝난 구독은 지운다. 기기마다 결과(sent·expired·failed)를 돌려준다.
 * notify와 운영자 다시 보내기(#373 ⑤)가 같이 쓴다
 */
export async function sendToDevices(
  db: Db,
  targets: readonly PushTarget[],
  message: { title: string; body: string; url: string; accountType: AccountType },
): Promise<PushResult[]> {
  // public/sw.js가 읽는 모양이다. account는 지금 계정의 알림인지 가르는 데 쓴다
  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    url: message.url,
    account: message.accountType,
  });
  return Promise.all(
    targets.map(async (target) => {
      const result = await sendWebPush(target, payload);
      if (result === 'expired') await deleteExpiredPushSubscription(db, target.endpoint);
      return result;
    }),
  );
}

/**
 * 알림을 기록하고(알림함, #371) 그 계정의 푸시 알림을 켜 둔 기기마다 보낸다.
 * 켜 둔 기기가 없어도 기록은 늘 남기고 no_device로 둔다(알림함에 쌓이고 화면 안내로 보인다, NOTI-05).
 * 보내기 전에 dedupe_key로 자리를 잡아서 동시에 불러도 한 줄만 남고 한 번만 간다. 그래서 먼저 sent로 적고, 한 기기도 못 받으면 failed로 바꾼다.
 * 실패해도 다시 보내지 않는다(운영자가 알림 확인 화면에서 다시 보낼 수 있다, #373 ⑤)
 */
export async function notify(db: Db, input: NewNotification): Promise<void> {
  const { userId, accountType, event, dedupeKey, title, body, url } = input;
  const targets = await readPushTargets(db, { userId, accountType });

  const [claimed] = await db
    .insert(notifications)
    .values({
      userId,
      accountType,
      event,
      dedupeKey,
      channel: 'web_push',
      payload: { title, body, url },
      status: targets.length === 0 ? 'no_device' : 'sent',
    })
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning({ id: notifications.id });
  if (!claimed || targets.length === 0) return;

  const results = await sendToDevices(db, targets, { title, body, url, accountType });
  if (!results.includes('sent')) {
    await db
      .update(notifications)
      .set({ status: 'failed', error: results.join(',') })
      .where(eq(notifications.id, claimed.id));
  }
}
