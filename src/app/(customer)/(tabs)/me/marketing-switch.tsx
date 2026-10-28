'use client';

import { useState, useTransition } from 'react';
import { cn } from 'cn';

import { setMarketingConsent } from '@/server/auth/customer-account';

import { marketingResultMessage } from './profile-rules';

/**
 * 광고성 정보 수신(관심 동네 새 매물 알림) 켜기·끄기 (C-103, C-601, D15).
 * 저장되면 처리 결과("{날짜}에 … 동의/거부 처리가 끝났어요")를 바로 보여준다(동의 문구 6-1). 끄면 철회 기록이 남는다(강규민 함수)
 */
export function MarketingSwitch({ initialAgreed }: { initialAgreed: boolean }) {
  const [agreed, setAgreed] = useState(initialAgreed);
  const [message, setMessage] = useState<{ kind: 'error' | 'done'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !agreed;
    setMessage(null);
    startTransition(async () => {
      const result = await setMarketingConsent(next);
      if (!result.ok) {
        setMessage({ kind: 'error', text: result.error.message });
        return;
      }
      const consent = result.data;
      setAgreed(consent.agreed);
      const processedAt = consent.agreedAt ?? consent.withdrawnAt ?? new Date();
      setMessage({ kind: 'done', text: marketingResultMessage(consent.agreed, processedAt) });
    });
  }

  return (
    <section className="flex flex-col gap-3 border-t pt-6" aria-label="알림 설정">
      <h2 className="font-semibold">알림</h2>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span id="marketing-label" className="text-sm font-medium">
            관심 동네 새 매물 알림 받기
          </span>
          <span className="text-xs text-muted-foreground">
            광고성 정보 수신 동의예요. 끄면 관심 동네 새 매물 알림을 보내지 않아요.
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={agreed}
          aria-labelledby="marketing-label"
          disabled={pending}
          onClick={toggle}
          className={cn(
            'relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60',
            agreed ? 'bg-primary' : 'bg-muted-foreground/30',
          )}
        >
          <span
            className={cn(
              'absolute top-1 left-1 size-5 rounded-full bg-background shadow-sm transition-transform',
              agreed && 'translate-x-5',
            )}
            aria-hidden
          />
        </button>
      </div>
      {message ? (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={message.kind === 'error' ? 'text-sm text-destructive' : 'text-sm text-primary'}
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
