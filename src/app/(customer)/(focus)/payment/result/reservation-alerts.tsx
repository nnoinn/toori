'use client';

import { Bell, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatReminderTimes } from '@/features/push/push-support';
import {
  IOS_INSTALL_NOTE,
  IOS_INSTALL_STEPS,
  PUSH_BLOCKED,
  PUSH_UNSUPPORTED,
} from '@/features/push/push-texts';
import { usePushAlerts } from '@/features/push/use-push-alerts';
import { REMINDER_MINUTES_BEFORE } from '@/server/policy';

/**
 * 예약 완료 화면의 "예약 알림 받기" (J14, C-602). 푸시 권한은 여기서 처음 묻는다(처음 들어오자마자 묻지 않는다).
 * 이 기기에서 이미 켠 고객 알림이면 "켜져 있어요"로 보여준다(서버 기록, #131).
 * 아이폰은 홈 화면에 추가하는 방법을, 알림을 막아 뒀으면 브라우저 설정 안내를 보여준다
 */
export function ReservationAlerts() {
  const push = usePushAlerts();

  // 켜져 있는지 확인하는 동안은 버튼이 잠깐 보였다 사라지지 않게 칸을 그리지 않는다
  if (push.state === 'checking') return null;

  let body: React.ReactNode;
  if (push.state === 'on') {
    body = (
      <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-primary">
        <Check className="size-4" aria-hidden />
        푸시 알림이 켜져 있어요
      </p>
    );
  } else if (push.state === 'ios-install') {
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
  } else if (push.state === 'unsupported') {
    body = <p className="text-sm text-muted-foreground">{PUSH_UNSUPPORTED}</p>;
  } else if (push.state === 'blocked') {
    body = <p className="text-sm text-muted-foreground">{PUSH_BLOCKED}</p>;
  } else {
    body = (
      <div className="flex flex-col gap-2">
        <Button type="button" className="self-start" disabled={push.pending} onClick={push.turnOn}>
          {push.pending ? '푸시 알림을 켜는 중…' : '푸시 알림 받기'}
        </Button>
        {push.message ? (
          <p
            role={push.message.kind === 'error' ? 'alert' : undefined}
            className={
              push.message.kind === 'error'
                ? 'text-sm text-destructive'
                : 'text-sm text-muted-foreground'
            }
          >
            {push.message.text}
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
