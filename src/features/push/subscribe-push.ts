import {
  getPushSubscriptionStatus,
  removeDevicePushSubscriptions,
  removePushSubscription,
  savePushSubscription,
} from '@/server/notifications/subscriptions';

import { urlBase64ToUint8Array } from './push-support';

export type SubscribePushResult =
  | { status: 'subscribed' }
  /** 알림 권한을 막았다. 브라우저 설정에서 허용해야 한다 */
  | { status: 'denied' }
  /** 권한 창을 닫았다. 다시 누르면 다시 묻는다 */
  | { status: 'dismissed' }
  | { status: 'failed'; message: string };

const SUBSCRIBE_FAILED = '알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요';
const UNSUBSCRIBE_FAILED = '알림을 끄지 못했어요. 잠시 후 다시 시도해 주세요';

/** 이 기기의 브라우저 구독 주소. 서비스 워커를 등록한 적이 없거나 구독이 없으면 null(등록하지 않고 보기만 한다) */
async function deviceEndpoint(): Promise<string | null> {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  return subscription?.endpoint ?? null;
}

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

/**
 * 이 기기에서 지금 계정의 알림이 켜져 있는지(#131). 서버의 구독 기록으로 본다.
 * 브라우저 구독은 한 기기에 하나라서, 그것만 보면 다른 계정이 켠 알림을 내가 켠 것으로 보여주게 된다
 */
export async function readPushStatus(): Promise<boolean> {
  const endpoint = await deviceEndpoint();
  if (!endpoint) return false;
  const result = await getPushSubscriptionStatus(endpoint);
  return result.ok && result.data.subscribed;
}

/**
 * 이 기기에서 지금 계정의 알림을 끈다(#131). 서버의 구독 기록만 지우고 브라우저 구독은 풀지 않는다.
 * 풀면 이 기기에서 켜 둔 다른 계정의 알림까지 끊긴다
 */
export async function unsubscribePush(): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const endpoint = await deviceEndpoint();
    if (!endpoint) return { ok: true };
    const result = await removePushSubscription(endpoint);
    return result.ok ? { ok: true } : { ok: false, message: result.error.message };
  } catch {
    return { ok: false, message: UNSUBSCRIBE_FAILED };
  }
}

/**
 * 로그아웃 직전에 부른다(#131). 이 기기의 내 구독을 두 계정 모두 지운다. 공용 기기에서 로그아웃한 뒤에도
 * 내 알림이 오지 않게 한다. 실패해도 로그아웃은 막지 않는다
 */
export async function clearDevicePushSubscriptions(): Promise<void> {
  try {
    const endpoint = await deviceEndpoint();
    if (endpoint) await removeDevicePushSubscriptions(endpoint);
  } catch {
    // 구독을 지우지 못해도 로그아웃은 한다. 다른 로그인이 이 기기에서 알림을 켜면 서버가 지운다(#131)
  }
}
