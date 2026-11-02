'use client';

import { useState, useSyncExternalStore, useTransition } from 'react';
import { Bell, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatReminderTimes, pushSupport } from '@/features/push/push-support';
import {
  IOS_INSTALL_NOTE,
  IOS_INSTALL_STEPS,
  PUSH_BLOCKED,
  PUSH_DISMISSED,
  PUSH_UNSUPPORTED,
} from '@/features/push/push-texts';
import { subscribePush, type SubscribePushResult } from '@/features/push/subscribe-push';
import { REMINDER_MINUTES_BEFORE } from '@/server/policy';

type DeviceState = 'checking' | 'supported' | 'blocked' | 'ios-install' | 'unsupported';

const noSubscribe = () => () => {};

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
 * 예약 완료 화면의 "예약 알림 받기" (J14, C-602). 푸시 권한은 여기서 처음 묻는다(처음 들어오자마자 묻지 않는다).
 * 아이폰은 홈 화면에 추가하는 방법을, 알림을 막아 뒀으면 브라우저 설정 안내를 보여준다.
 * TODO(#131): 강규민님 조회 함수가 들어오면 이 기기에서 이미 켠 고객 알림이면 "켜져 있어요"로 보여준다
 */
export function ReservationAlerts() {
  const device = useSyncExternalStore(noSubscribe, readDeviceState, () => 'checking' as const);
  const [result, setResult] = useState<SubscribePushResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (device === 'checking') return null;

  function turnOn() {
    startTransition(async () => {
      setResult(await subscribePush());
    });
  }

  let body: React.ReactNode;
  if (result?.status === 'subscribed') {
    body = (
      <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-primary">
        <Check className="size-4" aria-hidden />
        예약 알림을 켰어요
      </p>
    );
  } else if (device === 'ios-install') {
    body = (
      <div className="flex flex-col gap-1.5 text-sm">
        <p>{IOS_INSTALL_NOTE}</p>
        <ol className="flex list-decimal flex-col gap-0.5 pl-5 text-muted-foreground">
          {IOS_INSTALL_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    );
  } else if (device === 'unsupported') {
    body = <p className="text-sm text-muted-foreground">{PUSH_UNSUPPORTED}</p>;
  } else if (device === 'blocked' || result?.status === 'denied') {
    body = <p className="text-sm text-muted-foreground">{PUSH_BLOCKED}</p>;
  } else {
    body = (
      <div className="flex flex-col gap-2">
        <Button type="button" className="self-start" disabled={pending} onClick={turnOn}>
          {pending ? '알림을 켜는 중…' : '알림 받기'}
        </Button>
        {result?.status === 'dismissed' ? (
          <p className="text-sm text-muted-foreground">{PUSH_DISMISSED}</p>
        ) : result?.status === 'failed' ? (
          <p role="alert" className="text-sm text-destructive">
            {result.message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <section
      className="flex w-full flex-col gap-2 rounded-xl border bg-card p-4 text-left"
      aria-label="예약 알림"
    >
      <h2 className="flex items-center gap-2 font-semibold">
        <Bell className="size-4 text-primary" aria-hidden />
        예약 알림 받기
      </h2>
      <p className="text-sm text-muted-foreground">
        {formatReminderTimes(REMINDER_MINUTES_BEFORE)}에 알려 드려요.
      </p>
      {body}
    </section>
  );
}
