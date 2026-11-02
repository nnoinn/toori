import { savePushSubscription } from '@/server/notifications/subscriptions';

import { urlBase64ToUint8Array } from './push-support';

export type SubscribePushResult =
  | { status: 'subscribed' }
  /** 알림 권한을 막았다. 브라우저 설정에서 허용해야 한다 */
  | { status: 'denied' }
  /** 권한 창을 닫았다. 다시 누르면 다시 묻는다 */
  | { status: 'dismissed' }
  | { status: 'failed'; message: string };

const SUBSCRIBE_FAILED = '알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요';

/**
 * 이 기기에서 지금 계정(고객/원장님 모드)의 웹 푸시를 켠다 (J14, X-505-1, #131).
 * 사용자가 버튼을 눌렀을 때만 부른다(처음 들어오자마자 묻지 않는다, 기술 가이드 C-601·C-602).
 * 1) 알림 권한 2) 서비스 워커(/sw.js) 등록 3) 브라우저 구독(이미 있으면 그대로) 4) 서버에 저장(savePushSubscription, 강규민)
 * 이미 있는 브라우저 구독은 다른 계정이 켠 것일 수 있어서 풀지 않고 그대로 저장한다(한 기기 두 계정, 11/1 결정)
 */
export async function subscribePush(): Promise<SubscribePushResult> {
  const permission = await Notification.requestPermission();
  if (permission === 'denied') return { status: 'denied' };
  if (permission !== 'granted') return { status: 'dismissed' };

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return { status: 'failed', message: SUBSCRIBE_FAILED };
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }));
    const { endpoint, keys } = subscription.toJSON();
    if (!endpoint || !keys?.p256dh || !keys.auth) {
      return { status: 'failed', message: SUBSCRIBE_FAILED };
    }
    const result = await savePushSubscription({
      endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
    });
    return result.ok
      ? { status: 'subscribed' }
      : { status: 'failed', message: result.error.message };
  } catch {
    return { status: 'failed', message: SUBSCRIBE_FAILED };
  }
}
