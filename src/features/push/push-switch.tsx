'use client';

import { useId } from 'react';

import { Switch } from '@/components/ui/switch';

import { IOS_INSTALL_NOTE, IOS_INSTALL_STEPS, PUSH_BLOCKED, PUSH_UNSUPPORTED } from './push-texts';
import { usePushAlerts } from './use-push-alerts';

/**
 * "이 기기에서 알림 받기" 스위치 (J14·O12, C-601·C-602·S-404, #131·#307). 고객 내 정보 > 알림과 원장님 내 계정이 같이 쓴다.
 * 지금 들어와 있는 계정(고객·원장님)의 구독을 켜고 끈다. 켜짐 표시는 서버 기록(지금 계정의 구독)으로 한다.
 * 끄면 서버 기록만 지우고 브라우저 구독은 풀지 않는다(이 기기에서 켜 둔 다른 계정의 알림까지 끊기지 않게).
 * 아이폰은 홈 화면에 추가하는 방법을, 알림을 막아 뒀으면 푸는 방법을 보여준다
 */
export function PushSwitch({
  description,
  installSteps = IOS_INSTALL_STEPS,
}: {
  /** 이 계정이 받는 알림 설명. 예: "예약 확정과 2시간·15분 전 알림을 이 기기로 받아요." */
  description: string;
  /** 아이폰 홈 화면 추가 방법. 마지막 줄(알림을 켜는 곳)이 계정마다 달라서 바꿔 넣을 수 있다 */
  installSteps?: readonly string[];
}) {
  const push = usePushAlerts();
  const labelId = useId();
  const hasSwitch = push.state === 'checking' || push.state === 'on' || push.state === 'off';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span id={labelId} className="text-sm font-medium">
            이 기기에서 알림 받기
          </span>
          <span className="text-xs text-muted-foreground">{description}</span>
        </div>
        {hasSwitch ? (
          <Switch
            checked={push.state === 'on'}
            onCheckedChange={(on) => (on ? push.turnOn() : push.turnOff())}
            aria-labelledby={labelId}
            disabled={push.pending || push.state === 'checking'}
          />
        ) : null}
      </div>
      {push.state === 'ios-install' ? (
        <div className="flex flex-col gap-1.5 rounded-xl border bg-card p-3 text-sm">
          <p>{IOS_INSTALL_NOTE}</p>
          <ol className="flex list-decimal flex-col gap-0.5 pl-5 text-muted-foreground">
            {installSteps.map((step) => (
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
