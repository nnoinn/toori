'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
import { withoutRegionParam } from './region-link';
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const close = () => {
    setOpen(false);
    // 동네 링크(?region=)로 보던 중에 직접 골랐으면 주소의 동네를 지워 고른 쪽으로 보여준다
    const next = withoutRegionParam(pathname, searchParams.toString());
    if (next) router.replace(next, { scroll: false });
  };
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
        // 전국 시·군·구라 목록이 길다(#200). 화면 높이를 넘으면 시트 안에서 내린다
        className="mx-auto max-h-[85dvh] max-w-[480px] overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
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
