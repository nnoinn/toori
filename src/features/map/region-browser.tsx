'use client';

import { useState } from 'react';
import { Check, ChevronLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { FEATURED_REGIONS, type Region, REGION_SIDOS } from './regions';

type RegionBrowserProps = {
  /** 고른(선택 표시할) 동네 코드 */
  selectedCodes: readonly string[];
  onPick: (region: Region) => void;
  disabled?: boolean;
  /** 저장 중인 동네(버튼에 "저장 중…") */
  pendingCode?: string | null;
};

/**
 * 전국 동네 고르기 (#200). 시·도를 고르면 그 안의 시·군·구가 나온다.
 * 지금 영업하는 안산시 상록구·단원구는 시·도를 고르지 않고 맨 위에서 바로 고른다.
 * 동네 바꾸기(하나)와 관심 동네(여러 곳)가 같이 쓴다. 고른 뒤 할 일은 onPick에서 정한다
 */
export function RegionBrowser({
  selectedCodes,
  onPick,
  disabled = false,
  pendingCode = null,
}: RegionBrowserProps) {
  const [sidoCode, setSidoCode] = useState<string | null>(null);
  const sido = REGION_SIDOS.find((item) => item.code === sidoCode) ?? null;

  const regionButtons = (regions: readonly Region[]) => (
    <ul className="grid grid-cols-2 gap-2">
      {regions.map((region) => {
        const selected = selectedCodes.includes(region.code);
        return (
          <li key={region.code}>
            <Button
              type="button"
              variant={selected ? 'secondary' : 'outline'}
              className="h-auto min-h-11 w-full justify-between px-3 py-2 text-left whitespace-normal"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onPick(region)}
            >
              <span>{region.sigungu}</span>
              {pendingCode === region.code ? (
                <span className="shrink-0 text-xs text-muted-foreground">저장 중…</span>
              ) : selected ? (
                <Check className="shrink-0" aria-label="고름" />
              ) : null}
            </Button>
          </li>
        );
      })}
    </ul>
  );

  if (sido) {
    return (
      <div className="flex flex-col gap-3">
        <button
          type="button"
          className="flex items-center gap-1 self-start text-sm font-semibold max-md:min-h-10"
          onClick={() => setSidoCode(null)}
        >
          <ChevronLeft className="size-4" aria-hidden />
          {sido.name}
          <span className="font-normal text-muted-foreground">· 다른 시·도 고르기</span>
        </button>
        {/* 목록은 코드 순서라 찾기 쉽게 이름 순서로 보여 준다 */}
        {regionButtons([...sido.regions].sort((a, b) => a.sigungu.localeCompare(b.sigungu, 'ko')))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2" aria-label="지금 영업하는 동네">
        <h3 className="text-xs font-semibold text-muted-foreground">지금 영업하는 동네</h3>
        {regionButtons(FEATURED_REGIONS)}
      </section>
      <section className="flex flex-col gap-2" aria-label="시·도">
        <h3 className="text-xs font-semibold text-muted-foreground">다른 지역</h3>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {REGION_SIDOS.map((item) => (
            <li key={item.code}>
              <Button
                type="button"
                variant="ghost"
                className="h-auto min-h-10 w-full justify-start bg-muted/60 px-3 py-2 text-left whitespace-normal"
                disabled={disabled}
                onClick={() => setSidoCode(item.code)}
              >
                {item.name}
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
