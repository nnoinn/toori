'use client';

import { useState } from 'react';
import { ChevronDown, LocateFixed } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

import { MY_LOCATION_ENABLED } from './location-config';
import { RegionPicker } from './region-picker';
import { useMyLocation } from './use-my-location';

type LocationSwitcherProps = {
  /** 위쪽에 보여줄 이름. 예: 상록구, 내 위치 */
  label: string;
  selectedCode: string | null;
};

/** 홈 위쪽의 지금 동네 이름. 누르면 시트에서 '내 위치로'나 동네를 고른다 (C-102) */
export function LocationSwitcher({ label, selectedCode }: LocationSwitcherProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const { status, message, requestLocation } = useMyLocation(close);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" size="lg" className="gap-1 px-2 text-lg font-bold">
          {label}
          <ChevronDown aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="mx-auto max-w-[480px] rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader>
          <SheetTitle>동네 바꾸기</SheetTitle>
          <SheetDescription>고른 곳의 매물을 보여 드려요.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 pb-6">
          {MY_LOCATION_ENABLED ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-12 text-base"
                disabled={status === 'locating'}
                onClick={requestLocation}
              >
                <LocateFixed aria-hidden />
                {status === 'locating' ? '위치 확인 중…' : '내 위치로'}
              </Button>
              {message ? (
                <p role="alert" className="text-sm text-destructive">
                  {message}
                </p>
              ) : null}
            </>
          ) : null}
          <RegionPicker selectedCode={selectedCode} onSelected={close} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
