'use client';

import { useState } from 'react';
import { Check, Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { RegionBrowser } from '@/features/map/region-browser';
import { findRegion, regionFullName } from '@/features/map/regions';
import { setInterestAreas } from '@/server/notifications/interest-areas';

import {
  INTEREST_AREA_NOTE,
  INTEREST_NEEDS_CONSENT,
  toggleInterestArea,
} from './interest-area-rules';
import type { OptionalConsentState } from './consent-switch';

const SAVE_FAILED = '관심 동네를 저장하지 못했어요. 잠시 후 다시 시도해 주세요';

/**
 * 관심 동네 고르기 (J14, C-601, 전국 #200). 고른 동네는 칩으로, 더하기는 동네 고르기(시·도 → 시·군·구)로 한다.
 * 누르면 바로 저장한다(setInterestAreas, 강규민 #172).
 * 저장하는 동안에는 다시 누를 수 없다(저장이 겹쳐 화면과 서버 목록이 어긋나지 않게).
 * 동네를 골랐는데 관심 동네·찜한 샵 알림 동의가 없으면 이 자리에서 동의를 받는다(D15). 동네 저장은 동의와 상관없이 된다
 */
export function InterestAreas({
  initialCodes,
  consent,
}: {
  initialCodes: string[];
  consent: OptionalConsentState;
}) {
  const [codes, setCodes] = useState(initialCodes);
  /** 서버에 저장된 목록. 저장에 실패하면 이 목록으로 되돌린다 */
  const [saved, setSaved] = useState(initialCodes);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  /** 동네 더하기(전국 시·도 → 시·군·구)를 펼쳤는지 */
  const [adding, setAdding] = useState(false);
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
      {/* 고른 관심 동네. 전국 시·군·구라 모두 늘어놓지 않고, 고른 곳만 보여 주고 아래에서 더한다(#200) */}
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-labelledby="interest-label"
      >
        {codes.length === 0 ? (
          <span className="text-sm text-muted-foreground">아직 고른 관심 동네가 없어요.</span>
        ) : (
          codes.map((code) => {
            // 중구·동구처럼 이름이 겹치는 동네는 시·도까지 보여준다
            const region = findRegion(code);
            const label = region ? regionFullName(region) : code;
            return (
              <Button
                key={code}
                type="button"
                className="h-9 gap-1 rounded-full pr-2.5 pl-4 max-md:h-10"
                aria-label={`${label} 빼기`}
                disabled={status === 'saving'}
                onClick={() => toggle(code)}
              >
                {label}
                <X className="size-4" aria-hidden />
              </Button>
            );
          })
        )}
        <Button
          type="button"
          variant="outline"
          className="h-9 gap-1 rounded-full px-3 max-md:h-10"
          aria-expanded={adding}
          onClick={() => setAdding((open) => !open)}
        >
          <Plus className="size-4" aria-hidden />
          {adding ? '닫기' : '동네 더하기'}
        </Button>
      </div>
      {adding ? (
        <div className="rounded-xl border bg-card p-3">
          <RegionBrowser
            selectedCodes={codes}
            onPick={(region) => toggle(region.code)}
            disabled={status === 'saving'}
          />
        </div>
      ) : null}
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
            className="max-md:h-10"
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
