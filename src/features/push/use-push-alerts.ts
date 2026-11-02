'use client';

import { useEffect, useReducer, useState, useSyncExternalStore, useTransition } from 'react';

import { pushSupport } from './push-support';
import { PUSH_DISMISSED } from './push-texts';
import { readPushStatus, subscribePush, unsubscribePush } from './subscribe-push';

/**
 * 이 기기에서 지금 계정의 알림 상태.
 * checking: 아직 모름(서버에서 그릴 때, 켜져 있는지 묻는 중), ios-install: 아이폰인데 홈 화면 앱이 아님,
 * unsupported: 웹 푸시가 없는 브라우저, blocked: 알림 권한을 막아 둠, on·off: 켜짐·꺼짐(서버 기준)
 */
export type PushAlertsState = 'checking' | 'ios-install' | 'unsupported' | 'blocked' | 'on' | 'off';

type DeviceState = 'checking' | 'supported' | 'blocked' | 'ios-install' | 'unsupported';

/** 브라우저 설정에서 알림 권한을 바꾸면 화면을 다시 그린다(막았다가 허용하면 바로 켤 수 있게) */
function subscribePermission(onChange: () => void): () => void {
  let status: PermissionStatus | null = null;
  let stopped = false;
  navigator.permissions
    ?.query({ name: 'notifications' })
    .then((result) => {
      if (stopped) return;
      status = result;
      status.addEventListener('change', onChange);
    })
    .catch(() => {
      // 권한 변화를 알려 주지 않는 브라우저는 새로고침하면 다시 읽는다
    });
  return () => {
    stopped = true;
    status?.removeEventListener('change', onChange);
  };
}

/** 이 기기에서 푸시를 받을 수 있는지. 서버에서 그릴 때는 알 수 없어서 checking */
function readDeviceState(): DeviceState {
  const support = pushSupport({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone:
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
  });
  return support === 'supported' && Notification.permission === 'denied' ? 'blocked' : support;
}

/**
 * 이 기기 알림 켜기·끄기 (J14, C-601·C-602, #131). 예약 완료 화면의 "예약 알림 받기"와 내 정보 > 알림이 같이 쓴다.
 * 켜짐 표시는 서버 기록(getPushSubscriptionStatus)으로 한다. 화면을 다시 보여줄 때(Activity) 다시 확인한다
 */
export function usePushAlerts() {
  const device = useSyncExternalStore(
    subscribePermission,
    readDeviceState,
    () => 'checking' as const,
  );
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  // 권한 창에서 거절한 뒤 권한을 다시 읽어 그리게 한다(브라우저가 권한 변화를 알려 주지 않을 때도)
  const [, rereadPermission] = useReducer((n: number) => n + 1, 0);
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (device !== 'supported') return;
    let active = true;
    readPushStatus()
      .then((on) => {
        if (active) setSubscribed(on);
      })
      .catch(() => {
        if (active) setSubscribed(false);
      });
    return () => {
      active = false;
    };
  }, [device]);

  let state: PushAlertsState;
  if (device === 'checking') state = 'checking';
  else if (device === 'ios-install' || device === 'unsupported') state = device;
  else if (device === 'blocked') state = 'blocked';
  else if (subscribed === null) state = 'checking';
  else state = subscribed ? 'on' : 'off';

  function turnOn() {
    setMessage(null);
    startTransition(async () => {
      const result = await subscribePush();
      if (result.status === 'subscribed') setSubscribed(true);
      else if (result.status === 'denied') rereadPermission();
      else if (result.status === 'dismissed') setMessage({ kind: 'info', text: PUSH_DISMISSED });
      else setMessage({ kind: 'error', text: result.message });
    });
  }

  function turnOff() {
    setMessage(null);
    startTransition(async () => {
      const result = await unsubscribePush();
      if (result.ok) setSubscribed(false);
      else setMessage({ kind: 'error', text: result.message });
    });
  }

  return { state, pending, message, turnOn, turnOff };
}
