'use client';

import { useState, useTransition } from 'react';
import { Check } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { selectRegion } from './location-actions';
import { REGIONS } from './regions';

type RegionPickerProps = {
  /** 지금 고른 동네 코드. 표시만 한다 */
  selectedCode?: string | null;
  /** 저장이 끝난 뒤(시트 닫기 등) */
  onSelected?: () => void;
};

/** 동네 목록. 누르면 쿠키에 저장하고 화면을 새로 그린다 */
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
      <ul className="flex flex-col gap-2">
        {REGIONS.map((region) => {
          const selected = region.code === selectedCode;
          return (
            <li key={region.code}>
              <Button
                type="button"
                variant={selected ? 'secondary' : 'outline'}
                size="lg"
                className="h-12 w-full justify-between px-4 text-base"
                disabled={isPending}
                aria-pressed={selected}
                onClick={() => handleSelect(region.code)}
              >
                <span>{region.sigungu}</span>
                {isPending && pendingCode === region.code ? (
                  <span className="text-sm text-muted-foreground">저장 중…</span>
                ) : selected ? (
                  <Check aria-label="지금 동네" />
                ) : null}
              </Button>
            </li>
          );
        })}
      </ul>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
