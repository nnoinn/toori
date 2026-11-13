'use client';

import { Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  IOS_INSTALL_NOTE,
  IOS_INSTALL_STEPS,
  PUSH_BLOCKED,
  PUSH_UNSUPPORTED,
} from '@/features/push/push-texts';
import { usePushAlerts } from '@/features/push/use-push-alerts';

/**
 * 빈 동네 알림 상자의 "이 기기 푸시 알림 켜기" (C-208, #241 리뷰). 관심 동네 등록과 광고성 동의가 끝난 뒤에 보여준다.
 * 내 정보 > 알림의 "이 기기에서 푸시 알림 받기"와 같은 구독이다(usePushAlerts). 권한은 버튼을 눌렀을 때만 묻는다
 */
export function AreaDevicePush() {
  const push = usePushAlerts();

  // 켜져 있는지 확인하는 동안은 버튼이 잠깐 보였다 사라지지 않게 그리지 않는다
  if (push.state === 'checking') return null;

  if (push.state === 'on') {
    return (
      <p role="status" className="flex items-center gap-1 text-primary">
        <Check className="size-4" aria-hidden />이 기기 푸시 알림이 켜져 있어요
      </p>
    );
  }
  if (push.state === 'ios-install') {
    return (
      <div className="flex flex-col gap-1.5 text-left">
        <p>{IOS_INSTALL_NOTE}</p>
        <ol className="flex list-decimal flex-col gap-0.5 pl-5 text-muted-foreground">
          {IOS_INSTALL_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    );
  }
  if (push.state === 'unsupported')
    return <p className="text-muted-foreground">{PUSH_UNSUPPORTED}</p>;
  if (push.state === 'blocked') return <p className="text-muted-foreground">{PUSH_BLOCKED}</p>;

  return (
    <>
      <p>이 기기에서 푸시 알림을 켜면 새 매물 알림을 바로 받을 수 있어요.</p>
      <Button type="button" size="sm" disabled={push.pending} onClick={push.turnOn}>
        {push.pending ? '푸시 알림을 켜는 중…' : '이 기기 푸시 알림 켜기'}
      </Button>
      {push.message ? (
        <p
          role={push.message.kind === 'error' ? 'alert' : undefined}
          className={push.message.kind === 'error' ? 'text-destructive' : 'text-muted-foreground'}
        >
          {push.message.text}
        </p>
      ) : null}
    </>
  );
}
