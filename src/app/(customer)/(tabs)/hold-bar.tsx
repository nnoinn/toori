'use client';

import { Suspense, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { unstable_rethrow, usePathname, useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Countdown } from '@/components/ui/countdown';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getMyActiveHold, releaseHold } from '@/server/payments/checkout';
import type { ActiveHold } from '@/server/payments/types';

import {
  HOLD_BAR_LABEL,
  HOLD_RELEASE_CONFIRM,
  holdBarStartText,
  holdBarTitle,
} from './hold-bar-texts';
import { checkoutPath } from './slots/[slotId]/reserve-button';

const RELEASE_FAILED_MESSAGE = '취소하지 못했어요. 잠시 후 다시 시도해 주세요';

/**
 * 결제 중 매물 막대(#359 1번, 점검 5-1). 지금 내 홀딩(C-404, 한 사람은 하나)이 있으면 아래 메뉴가 있는 고객 화면 아래쪽에 띄운다.
 * 폰은 아래 메뉴 바로 위, PC는 창 맨 아래. 높이(h-14)는 layout의 --hold-bar-h와 같다(그만큼 아래 여백을 늘려 내용이 가리지 않게).
 * 누르면 예약 확인 화면으로 가서 결제를 이어서 하고, [취소]는 한 번 물은 뒤 홀딩을 푼다(releaseHold).
 * 타이머는 예약 확인 화면과 같은 서버 시각 기준이고, 시간이 다 되면 막대가 사라진다
 */
export function HoldBar() {
  // 지금 주소(usePathname)를 읽는 부분만 <Suspense>로 감싼다(Cache Components, customer-nav와 같은 방식)
  return (
    <Suspense fallback={null}>
      <HoldBarLoader />
    </Suspense>
  );
}

/** 화면을 옮길 때마다, 그리고 다른 앱에 갔다가 돌아올 때 지금 내 홀딩을 서버에 묻는다(getMyActiveHold) */
function HoldBarLoader() {
  const pathname = usePathname();
  const [hold, setHold] = useState<ActiveHold | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const result = await getMyActiveHold();
        // 로그인 안 함·원장님 모드·홀딩 없음은 모두 null이다
        if (!ignore) setHold(result.ok ? result.data : null);
      } catch {
        // 읽지 못하면 지금 막대를 그대로 둔다. 다음 화면 이동 때 다시 묻는다
      }
    }
    void load();
    function handleVisible() {
      if (document.visibilityState === 'visible') void load();
    }
    document.addEventListener('visibilitychange', handleVisible);
    return () => {
      ignore = true;
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [pathname]);

  if (!hold) return null;
  // 다른 매물을 홀딩하면 확인 창 상태를 새로 시작한다
  return <HoldBarView key={hold.slotId} hold={hold} onGone={() => setHold(null)} />;
}

function HoldBarView({ hold, onGone }: { hold: ActiveHold; onGone: () => void }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const title = holdBarTitle(hold);
  const startText = holdBarStartText(hold.startAt);
  const href = checkoutPath(hold.slotId);

  function handleOpenChange(next: boolean) {
    if (pending) return;
    setError(null);
    setConfirming(next);
  }

  function release() {
    setError(null);
    startTransition(async () => {
      try {
        await releaseHold(hold.slotId);
      } catch (caught) {
        unstable_rethrow(caught);
        setError(RELEASE_FAILED_MESSAGE);
        return;
      }
      setConfirming(false);
      onGone();
      // 보고 있는 화면(매물 상세의 "결제 이어서 하기" 등)을 새로 읽는다
      router.refresh();
    });
  }

  return (
    <section
      data-hold-bar
      aria-label={HOLD_BAR_LABEL}
      className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 mx-auto h-14 w-full max-w-[480px] border-t bg-card md:bottom-0 md:max-w-none"
    >
      <div className="flex h-full items-center gap-3 pr-2 pl-4 md:mx-auto md:max-w-5xl md:px-6">
        <div
          className="flex shrink-0 flex-col items-center rounded-lg bg-primary/10 px-2 py-0.5 text-primary"
          aria-label="결제 가능 남은 시간"
        >
          <span className="text-xs">결제 중</span>
          <Countdown
            targetAt={hold.holdExpiresAt}
            serverNow={hold.serverNow}
            variant="clock"
            onExpire={onGone}
            className="text-sm font-semibold"
          />
        </div>
        {/* 막대 전체를 눌러도 예약 확인 화면으로 간다(after로 막대를 덮고, [취소]만 그 위에 둔다) */}
        <Link
          href={href}
          className="flex min-w-0 flex-1 items-center gap-2 after:absolute after:inset-0"
        >
          <span className="sr-only">결제 이어서 하기: </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold">{title}</span>
            <span className="truncate text-xs text-muted-foreground">{startText}</span>
          </span>
          <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
        <Button
          type="button"
          variant="ghost"
          className="relative z-10 h-10 shrink-0"
          onClick={() => handleOpenChange(true)}
        >
          취소
        </Button>
      </div>
      <Dialog open={confirming} onOpenChange={handleOpenChange}>
        <DialogContent showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>{HOLD_RELEASE_CONFIRM.title}</DialogTitle>
            <DialogDescription>{HOLD_RELEASE_CONFIRM.description}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-0.5 rounded-lg bg-muted p-3 text-sm">
            <p className="font-semibold">{title}</p>
            <p className="text-muted-foreground">{startText}</p>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 max-md:*:h-10">
            <Link
              href={href}
              className={buttonVariants({
                variant: 'outline',
                className: pending ? 'pointer-events-none opacity-50' : undefined,
              })}
              aria-disabled={pending || undefined}
              onClick={() => setConfirming(false)}
            >
              {HOLD_RELEASE_CONFIRM.keep}
            </Link>
            <Button type="button" variant="destructive" disabled={pending} onClick={release}>
              {pending ? '취소하는 중…' : HOLD_RELEASE_CONFIRM.release}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
