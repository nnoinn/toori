'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from 'cn';
import { Bell } from 'lucide-react';

import { buttonVariants } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

// 알림 종과 안 읽은 수(#371). 고객·원장님·운영자 화면이 같이 쓴다. 숫자는 화면이 서버에서 받아 넘긴다.
// 종을 누르면 바로 아래에 최근 알림 상자가 뜨고, 상자 아래 버튼으로 알림함 화면에 간다(11/16 nnoinn, 고객·운영자 같음).
// 상자 안의 줄은 부르는 화면이 그린다(panel). panel이 없으면 예전처럼 알림함으로 바로 가는 링크다.
// 화면 안내(위 가운데 5초)와 1분마다 새 알림을 확인하는 부품은 notification-toast.tsx다. 누르는 칸은 40px(폰 기준, #417)이다.

/** 종 옆 안 읽은 수. 0이면 표시하지 않는다(null), 100개 이상은 "99+" */
export function unreadBadgeText(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? '99+' : String(count);
}

const BELL_CLASS =
  'relative inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-foreground hover:bg-muted';

function BellIcon({ badge }: { badge: string | null }) {
  return (
    <>
      <Bell className="size-5" aria-hidden />
      {badge ? (
        <span
          aria-hidden
          className="absolute top-1 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground"
        >
          {badge}
        </span>
      ) : null}
    </>
  );
}

type NotificationBellProps = {
  /** 알림함 주소. 고객은 /notifications */
  href: string;
  unreadCount: number;
  className?: string;
  /**
   * 종을 누르면 아래 상자에 그릴 최근 알림. 상자가 열릴 때만 그려진다(그때 불러오면 된다).
   * close는 줄을 눌러 다른 화면으로 갈 때 상자를 닫는다
   */
  panel?: (close: () => void) => React.ReactNode;
  /** 상자 아래 버튼 글자 */
  footerLabel?: string;
};

export function NotificationBell({
  href,
  unreadCount,
  className,
  panel,
  footerLabel = '알림함으로 가기',
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const badge = unreadBadgeText(unreadCount);
  const label = badge ? `알림, 안 읽은 알림 ${badge}개` : '알림';

  if (!panel) {
    return (
      <Link href={href} aria-label={label} className={cn(BELL_CLASS, className)}>
        <BellIcon badge={badge} />
      </Link>
    );
  }

  const close = () => setOpen(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={label}
        className={cn(
          BELL_CLASS,
          'outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-open:bg-muted',
          className,
        )}
      >
        <BellIcon badge={badge} />
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-[min(22rem,calc(100vw-2rem))] flex-col p-0">
        <p className="border-b px-4 py-3 text-sm font-semibold">알림</p>
        <div className="max-h-[min(26rem,60vh)] overflow-y-auto">{open ? panel(close) : null}</div>
        <div className="border-t p-2">
          <Link
            href={href}
            onClick={close}
            className={buttonVariants({ variant: 'ghost', className: 'w-full' })}
          >
            {footerLabel}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** 알림 상자 한 줄. 안 읽은 줄은 초록 점과 굵은 제목이다 */
export function NotificationPanelItem({
  title,
  body,
  meta,
  unread = false,
  onSelect,
}: {
  title: string;
  body?: string;
  /** 시각 등 줄 아래 작은 글자 */
  meta: string;
  unread?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-start gap-2 px-4 py-3 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
    >
      <span
        aria-hidden
        className={cn(
          'mt-1.5 size-2 shrink-0 rounded-full',
          unread ? 'bg-primary' : 'bg-transparent',
        )}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn('line-clamp-1', unread && 'font-semibold')}>
          {unread ? <span className="sr-only">안 읽음, </span> : null}
          {title}
        </span>
        {body ? <span className="line-clamp-1 text-muted-foreground">{body}</span> : null}
        <span className="text-xs text-muted-foreground">{meta}</span>
      </span>
    </button>
  );
}

/** 알림 상자의 안내 한 줄(불러오는 중, 비었음, 못 불러옴) */
export function NotificationPanelMessage({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}
