'use client';

import { useState, useTransition } from 'react';

import { selectRegion } from './location-actions';
import { RegionBrowser } from './region-browser';

type RegionPickerProps = {
  /** 지금 고른 동네 코드. 표시만 한다 */
  selectedCode?: string | null;
  /** 저장이 끝난 뒤(시트 닫기 등) */
  onSelected?: () => void;
};

/** 동네 하나 고르기(처음 안내, 위쪽 동네 바꾸기). 전국 시·도 → 시·군·구(#200). 누르면 쿠키에 저장하고 화면을 새로 그린다 */
export function RegionPicker({ selectedCode, onSelected }: RegionPickerProps) {
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSelect(code: string) {
    setError(null);
    setPendingCode(code);
    startTransition(async () => {
      const result = await selectRegion(code);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      onSelected?.();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <RegionBrowser
        selectedCodes={selectedCode ? [selectedCode] : []}
        onPick={(region) => handleSelect(region.code)}
        disabled={isPending}
        pendingCode={isPending ? pendingCode : null}
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
