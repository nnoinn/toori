// 웹 푸시 한 건 보내기 (X-505-1, W16, #131). 서버에서만 부른다. 내용 암호화와 VAPID 서명은 web-push 패키지가 한다.

import 'server-only';

import webpush from 'web-push';

import type { PushTarget } from './subscription-store';

/** 푸시 서버가 문제가 있을 때 연락할 곳. https 주소나 mailto만 받고, 개인 메일을 쓰지 않으려고 서비스 주소를 쓴다 */
const VAPID_SUBJECT = 'https://toori.kr';
/** 기기가 꺼져 있으면 푸시 서버가 이 시간까지 들고 있다가 전달한다 */
const PUSH_TTL_SECONDS = 24 * 60 * 60;
const PUSH_TIMEOUT_MS = 5_000;

/** sent: 푸시 서버가 받았다. expired: 구독이 끝났다(404·410). failed: 보내지 못했다 */
export type PushResult = 'sent' | 'expired' | 'failed';

export async function sendWebPush(target: PushTarget, payload: string): Promise<PushResult> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.error('[notify] NEXT_PUBLIC_VAPID_PUBLIC_KEY·VAPID_PRIVATE_KEY가 없어요');
    return 'failed';
  }

  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      payload,
      {
        vapidDetails: { subject: VAPID_SUBJECT, publicKey, privateKey },
        TTL: PUSH_TTL_SECONDS,
        timeout: PUSH_TIMEOUT_MS,
        urgency: 'high',
      },
    );
    return 'sent';
  } catch (error) {
    // 오류 안에 구독 주소가 들어 있어서 상태 코드만 남긴다
    if (error instanceof webpush.WebPushError) {
      if (error.statusCode === 404 || error.statusCode === 410) return 'expired';
      console.error('[notify] 웹 푸시 실패:', error.statusCode);
    } else {
      console.error('[notify] 웹 푸시 실패:', error instanceof Error ? error.name : 'unknown');
    }
    return 'failed';
  }
}
