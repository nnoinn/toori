'use client';

import { useId, useState, useTransition } from 'react';

import { Switch } from '@/components/ui/switch';
import type { OptionalTerms } from '@/server/auth';
import { setOptionalConsent } from '@/server/auth/customer-account';

import { consentResultMessage } from './profile-rules';

/**
 * 선택 동의 하나의 상태와 켜기·끄기 (C-103, C-601, #267). 동의는 관심 동네·찜한 샵 새 매물 알림과 이벤트·혜택 소식 둘이고 따로 켜고 끈다.
 * 내 정보의 스위치, 관심 동네·빈 동네 알림 상자·찜 버튼의 "동의하고 알림 받기"가 같이 쓴다.
 * 저장되면 처리 결과("{날짜}에 … 동의/거부 처리가 끝났어요")를 바로 보여준다(동의 문구 6-1). 끄면 철회 기록이 남는다(강규민 함수)
 */
export function useOptionalConsent(type: OptionalTerms, initialAgreed: boolean) {
  const [agreed, setAgreed] = useState(initialAgreed);
  const [message, setMessage] = useState<ConsentMessage | null>(null);
  const [pending, startTransition] = useTransition();
  // 화면을 떠났다 와도 예전 상태가 남으므로(Activity) 서버 값이 바뀌었으면 맞춘다
  const [serverAgreed, setServerAgreed] = useState(initialAgreed);
  if (serverAgreed !== initialAgreed) {
    setServerAgreed(initialAgreed);
    setAgreed(initialAgreed);
  }

  function change(next: boolean) {
    setMessage(null);
    startTransition(async () => {
      const result = await setOptionalConsent(type, next);
      if (!result.ok) {
        setMessage({ kind: 'error', text: result.error.message });
        return;
      }
      const consent = result.data;
      setAgreed(consent.agreed);
      const processedAt = consent.agreedAt ?? consent.withdrawnAt ?? new Date();
      setMessage({ kind: 'done', text: consentResultMessage(type, consent.agreed, processedAt) });
    });
  }

  return { agreed, message, pending, change };
}

type ConsentMessage = { kind: 'error' | 'done'; text: string };

export type OptionalConsentState = ReturnType<typeof useOptionalConsent>;

/** 동의 처리 결과 또는 실패 한 줄 */
export function ConsentResult({ message }: { message: ConsentMessage | null }) {
  if (!message) return null;
  return (
    <p
      role={message.kind === 'error' ? 'alert' : 'status'}
      className={message.kind === 'error' ? 'text-sm text-destructive' : 'text-sm text-primary'}
    >
      {message.text}
    </p>
  );
}

/** 선택 동의 스위치와 처리 결과 */
export function ConsentSwitch({
  consent,
  label,
  description,
}: {
  consent: OptionalConsentState;
  label: string;
  description: string;
}) {
  const labelId = useId();
  const { agreed, message, pending, change } = consent;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span id={labelId} className="text-sm font-medium">
            {label}
          </span>
          <span className="text-xs text-muted-foreground">{description}</span>
        </div>
        <Switch
          checked={agreed}
          onCheckedChange={change}
          aria-labelledby={labelId}
          disabled={pending}
        />
      </div>
      <ConsentResult message={message} />
    </div>
  );
}
