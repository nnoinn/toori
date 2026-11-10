'use client';

import { Switch } from '@/components/ui/switch';
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
 * 내 정보 > 알림의 "이 기기에서 알림 받기" (J14, C-601·C-602, #131).
 * 켜짐 표시는 서버 기록(지금 계정의 구독)으로 한다. 끄면 서버 기록만 지우고 브라우저 구독은 풀지 않는다
 * (이 기기에서 켜 둔 원장님 알림까지 끊기지 않게). 아이폰은 홈 화면에 추가하는 방법을 보여준다
 */
export function PushSwitch() {
  const push = usePushAlerts();
  const hasSwitch = push.state === 'checking' || push.state === 'on' || push.state === 'off';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span id="push-label" className="text-sm font-medium">
            이 기기에서 알림 받기
          </span>
          <span className="text-xs text-muted-foreground">
            예약 확정과 {formatReminderTimes(REMINDER_MINUTES_BEFORE)} 알림, 관심 동네·찜한 샵 새
            매물 알림을 이 기기로 받아요.
          </span>
        </div>
        {hasSwitch ? (
          <Switch
            checked={push.state === 'on'}
            onCheckedChange={(on) => (on ? push.turnOn() : push.turnOff())}
            aria-labelledby="push-label"
            disabled={push.pending || push.state === 'checking'}
          />
        ) : null}
      </div>
      {push.state === 'ios-install' ? (
        <div className="flex flex-col gap-1.5 rounded-xl border bg-card p-3 text-sm">
          <p>{IOS_INSTALL_NOTE}</p>
          <ol className="flex list-decimal flex-col gap-0.5 pl-5 text-muted-foreground">
            {IOS_INSTALL_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : push.state === 'unsupported' ? (
        <p className="text-sm text-muted-foreground">{PUSH_UNSUPPORTED}</p>
      ) : push.state === 'blocked' ? (
        <p className="text-sm text-muted-foreground">{PUSH_BLOCKED}</p>
      ) : push.message ? (
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
