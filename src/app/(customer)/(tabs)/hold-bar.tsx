'use client';

import { createContext, Suspense, use, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { unstable_rethrow, usePathname, useRouter } from 'next/navigation';
import { ChevronRight, Timer, X } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import { Countdown } from '@/components/ui/countdown';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getMyActiveHold, releaseHold } from '@/server/payments/checkout';
import type { ActiveHold } from '@/server/payments/types';

import {
  HOLD_BAR_LABEL,
  HOLD_CHIP,
  HOLD_RELEASE_CONFIRM,
  holdBarStartText,
  holdBarTitle,
} from './hold-bar-texts';
import { checkoutPath } from './slots/[slotId]/reserve-button';

const RELEASE_FAILED_MESSAGE = '취소하지 못했어요. 잠시 후 다시 시도해 주세요';

type HoldState = { hold: ActiveHold | null; setHold: (hold: ActiveHold | null) => void };

const HoldContext = createContext<HoldState>({ hold: null, setHold: () => {} });

/**
 * 결제 중 매물(#359 1번 → 11/22 손 점검 3번, 11/23 nnoinn 시안 A). 지금 내 홀딩(C-404, 한 사람은 하나)이 있으면
 * PC는 위쪽 메뉴의 알림 종 옆 초록 칩(HoldChip), 폰은 화면 위 가운데 초록 알약(HoldPill)으로 남은 시간을 보여 준다.
 * 아래 메뉴가 있는 고객 화면 틀(layout)이 한 번 감싸고, 칩과 알약은 같은 홀딩을 쓴다.
 * 타이머는 예약 확인 화면과 같은 서버 시각 기준이고, 시간이 다 되면 칩·알약이 사라진다
 */
export function HoldProvider({ children }: { children: React.ReactNode }) {
  const [hold, setHold] = useState<ActiveHold | null>(null);
  const value = useMemo(() => ({ hold, setHold }), [hold]);
  return (
    <HoldContext value={value}>
      {/* 지금 주소(usePathname)를 읽는 부분만 <Suspense>로 감싼다(Cache Components, customer-nav와 같은 방식) */}
      <Suspense fallback={null}>
        <HoldLoader setHold={setHold} />
      </Suspense>
      {children}
    </HoldContext>
  );
}

/** 화면을 옮길 때마다, 그리고 다른 앱에 갔다가 돌아올 때 지금 내 홀딩을 서버에 묻는다(getMyActiveHold). 아무것도 그리지 않는다 */
function HoldLoader({ setHold }: { setHold: (hold: ActiveHold | null) => void }) {
  const pathname = usePathname();

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const result = await getMyActiveHold();
        // 로그인 안 함·원장님 모드·홀딩 없음은 모두 null이다
        if (!ignore) setHold(result.ok ? result.data : null);
      } catch {
        // 읽지 못하면 지금 표시를 그대로 둔다. 다음 화면 이동 때 다시 묻는다
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
  }, [pathname, setHold]);

  return null;
}

/** PC 위쪽 메뉴의 알림 종 옆 칩. 누르면 아래 상자에 매물과 [결제 이어서 하기]·[그만두기]가 뜬다. 폰에서는 숨긴다(HoldPill) */
export function HoldChip() {
  const { hold, setHold } = use(HoldContext);
  if (!hold) return null;
  // 다른 매물을 홀딩하면 상자·확인 창 상태를 새로 시작한다
  return <HoldChipView key={hold.slotId} hold={hold} onGone={() => setHold(null)} />;
}

function HoldChipView({ hold, onGone }: { hold: ActiveHold; onGone: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const title = holdBarTitle(hold);

  return (
    <div className="hidden md:block">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label={`${HOLD_BAR_LABEL}: ${title}`}
          className="flex h-10 items-center gap-1.5 rounded-full bg-primary pr-3.5 pl-3 text-sm font-semibold text-primary-foreground shadow-sm outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Timer className="size-4" aria-hidden />
          {HOLD_CHIP.label}
          <Countdown
            targetAt={hold.holdExpiresAt}
            serverNow={hold.serverNow}
            variant="clock"
            onExpire={onGone}
          />
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-80 flex-col gap-3 p-4 text-sm">
          <div className="flex flex-col gap-0.5">
            <p className="font-semibold">{title}</p>
            <p className="text-muted-foreground">{holdBarStartText(hold.startAt)}</p>
            <p className="text-xs text-muted-foreground">{HOLD_CHIP.note}</p>
          </div>
          <div className="flex gap-2">
            <Link
              href={checkoutPath(hold.slotId)}
              onClick={() => setOpen(false)}
              className={buttonVariants({ className: 'flex-1' })}
            >
              {HOLD_CHIP.continue}
            </Link>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                setConfirming(true);
              }}
            >
              {HOLD_CHIP.release}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <HoldReleaseDialog
        hold={hold}
        open={confirming}
        onOpenChange={setConfirming}
        onReleased={onGone}
      />
    </div>
  );
}

/**
 * 폰 화면 위 가운데 초록 알약. 누르면 예약 확인 화면으로 가서 결제를 이어서 하고, ×는 한 번 물은 뒤 홀딩을 푼다.
 * 알약이 있는 동안 화면 틀(layout)이 그 높이만큼 위를 비운다(data-hold-pill, --hold-top). PC에서는 숨긴다(HoldChip)
 */
export function HoldPill() {
  const { hold, setHold } = use(HoldContext);
  if (!hold) return null;
  return <HoldPillView key={hold.slotId} hold={hold} onGone={() => setHold(null)} />;
}

function HoldPillView({ hold, onGone }: { hold: ActiveHold; onGone: () => void }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <section
      data-hold-pill
      aria-label={HOLD_BAR_LABEL}
      className="fixed inset-x-0 top-[calc(0.5rem+env(safe-area-inset-top))] z-30 mx-auto w-full max-w-[480px] px-3 md:hidden"
    >
      <div className="relative flex h-11 items-center gap-2 rounded-full bg-primary pr-1 pl-3.5 text-primary-foreground shadow-lg">
        <Timer className="size-4 shrink-0" aria-hidden />
        <Countdown
          targetAt={hold.holdExpiresAt}
          serverNow={hold.serverNow}
          variant="clock"
          onExpire={onGone}
          className="shrink-0 text-sm font-semibold"
        />
        {/* 알약 전체를 눌러도 예약 확인 화면으로 간다(after로 알약을 덮고, ×만 그 위에 둔다) */}
        <Link
          href={checkoutPath(hold.slotId)}
          className="flex min-w-0 flex-1 items-center gap-1 outline-none after:absolute after:inset-0 after:rounded-full focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
        >
          <span className="sr-only">결제 이어서 하기: </span>
          <span className="truncate text-sm">
            {HOLD_CHIP.label} · {holdBarTitle(hold)}
          </span>
          <ChevronRight className="ml-auto size-4 shrink-0" aria-hidden />
        </Link>
        <button
          type="button"
          aria-label={HOLD_CHIP.release}
          onClick={() => setConfirming(true)}
          className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full outline-none hover:bg-white/15 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <HoldReleaseDialog
        hold={hold}
        open={confirming}
        onOpenChange={setConfirming}
        onReleased={onGone}
      />
    </section>
  );
}

/**
 * [그만두기]를 누르면 한 번 묻는 창(11/14 정찬형 승인). [계속 결제하기]는 창만 닫고(11/22 손 점검), [그만두기]는 홀딩을 푼다(releaseHold).
 * 다 풀면 보고 있는 화면(매물 상세의 "결제 이어서 하기" 등)을 새로 읽는다
 */
function HoldReleaseDialog({
  hold,
  open,
  onOpenChange,
  onReleased,
}: {
  hold: ActiveHold;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReleased: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (pending) return;
    setError(null);
    onOpenChange(next);
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
      onOpenChange(false);
      onReleased();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{HOLD_RELEASE_CONFIRM.title}</DialogTitle>
          <DialogDescription>{HOLD_RELEASE_CONFIRM.description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-0.5 rounded-lg bg-muted p-3 text-sm">
          <p className="font-semibold">{holdBarTitle(hold)}</p>
          <p className="text-muted-foreground">{holdBarStartText(hold.startAt)}</p>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 max-md:*:h-10">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => handleOpenChange(false)}
          >
            {HOLD_RELEASE_CONFIRM.keep}
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={release}>
            {pending ? '취소하는 중…' : HOLD_RELEASE_CONFIRM.release}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
