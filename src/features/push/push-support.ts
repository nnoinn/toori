// 웹 푸시를 받을 수 있는 기기인지와 구독에 쓰는 값 (J14, X-505-1, #131). 화면에서 쓴다.
// 브라우저 값은 받아서 판단만 한다(테스트할 수 있게). 실제 구독은 subscribe-push.ts.

export type PushSupport =
  | 'supported'
  /** 아이폰·아이패드인데 홈 화면에 추가한 앱으로 열지 않았다. 추가해야 푸시를 받는다(iOS 16.4 이상) */
  | 'ios-install'
  | 'unsupported';

export type PushEnv = {
  userAgent: string;
  maxTouchPoints: number;
  /** 홈 화면에 추가한 앱으로 열었는지(display-mode: standalone) */
  standalone: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
};

/** 아이폰·아이패드. 아이패드는 맥처럼 보이지만 터치가 된다 */
export function isIos(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

export function pushSupport(env: PushEnv): PushSupport {
  if (isIos(env.userAgent, env.maxTouchPoints) && !env.standalone) return 'ios-install';
  return env.hasServiceWorker && env.hasPushManager && env.hasNotification
    ? 'supported'
    : 'unsupported';
}

/** VAPID 공개 키(base64url)를 PushManager.subscribe가 받는 모양으로 바꾼다 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** 리마인드 시각을 문구로(정책값 REMINDER_MINUTES_BEFORE). 예: [120, 15] → "시작 2시간 전·15분 전" */
export function formatReminderTimes(minutesBefore: readonly number[]): string {
  const label = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours === 0) return `${rest}분`;
    return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
  };
  return `시작 ${minutesBefore.map((minutes) => `${label(minutes)} 전`).join('·')}`;
}
