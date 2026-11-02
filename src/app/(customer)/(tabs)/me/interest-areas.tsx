'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { REGIONS } from '@/features/map/regions';
import { setInterestAreas } from '@/server/notifications/interest-areas';

import {
  INTEREST_AREA_NOTE,
  INTEREST_NEEDS_CONSENT,
  toggleInterestArea,
} from './interest-area-rules';
import type { MarketingConsent } from './marketing-switch';

const SAVE_FAILED = '관심 동네를 저장하지 못했어요. 잠시 후 다시 시도해 주세요';

/**
 * 관심 동네 고르기 (J14, C-601). 누르면 바로 저장한다(setInterestAreas, 강규민 #172).
 * 저장하는 동안에는 다시 누를 수 없다(저장이 겹쳐 화면과 서버 목록이 어긋나지 않게).
 * 동네를 골랐는데 광고성 정보 수신 동의가 없으면 이 자리에서 동의를 받는다(D15). 동네 저장은 동의와 상관없이 된다
 */
export function InterestAreas({
  initialCodes,
  consent,
}: {
  initialCodes: string[];
  consent: MarketingConsent;
}) {
  const [codes, setCodes] = useState(initialCodes);
  /** 서버에 저장된 목록. 저장에 실패하면 이 목록으로 되돌린다 */
  const [saved, setSaved] = useState(initialCodes);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  // 화면을 떠났다 와도 예전 상태가 남으므로(Activity) 서버 값이 바뀌었으면 맞춘다
  const [server, setServer] = useState(initialCodes);
  if (server.join() !== initialCodes.join()) {
    setServer(initialCodes);
    setCodes(initialCodes);
    setSaved(initialCodes);
  }

  function toggle(code: string) {
    const next = toggleInterestArea(codes, code);
    setCodes(next);
    setStatus('saving');
    setError(null);
    const fail = (message: string) => {
      setCodes(saved);
      setStatus('idle');
      setError(message);
    };
    setInterestAreas(next).then(
      (result) => {
        if (!result.ok) {
          fail(result.error.message);
          return;
        }
        setCodes(result.data.sigunguCodes);
        setSaved(result.data.sigunguCodes);
        setStatus('saved');
      },
      () => fail(SAVE_FAILED),
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <span id="interest-label" className="text-sm font-medium">
          관심 동네
        </span>
        <span className="text-xs text-muted-foreground">{INTEREST_AREA_NOTE}</span>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-labelledby="interest-label">
        {REGIONS.map((region) => {
          const selected = codes.includes(region.code);
          return (
            <Button
              key={region.code}
              type="button"
              variant={selected ? 'default' : 'outline'}
              className="h-9 rounded-full px-4"
              aria-pressed={selected}
              disabled={status === 'saving'}
              onClick={() => toggle(region.code)}
            >
              {region.name}
            </Button>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        <p aria-live="polite" className="text-xs">
          {status === 'saving' ? (
            <span className="text-muted-foreground">저장하는 중…</span>
          ) : status === 'saved' ? (
            <span className="flex items-center gap-1 text-primary">
              <Check className="size-3.5" aria-hidden />
              저장했어요
            </span>
          ) : null}
        </p>
      )}
      {codes.length > 0 && !consent.agreed ? (
        <div className="flex flex-col items-start gap-2 rounded-xl border bg-card p-3 text-sm">
          <p>{INTEREST_NEEDS_CONSENT}</p>
          <Button
            type="button"
            size="sm"
            disabled={consent.pending}
            onClick={() => consent.change(true)}
          >
            {consent.pending ? '처리하는 중…' : '동의하고 알림 받기'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
