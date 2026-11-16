import Link from 'next/link';
import { cn } from 'cn';
import { Bell } from 'lucide-react';

// 알림함으로 가는 종과 안 읽은 수(#371). 고객·원장님 화면이 같이 쓴다. 안 읽은 수는 화면이 서버에서 받아 넘긴다.
// 화면 안내(위 가운데 5초)와 1분마다 새 알림을 확인하는 부품은 현동훈이 따로 만든다(#371).
// 누르는 칸은 40px(폰 기준, #417)이다.

/** 종 옆 안 읽은 수. 0이면 표시하지 않는다(null), 100개 이상은 "99+" */
export function unreadBadgeText(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? '99+' : String(count);
}

type NotificationBellProps = {
  /** 알림함 주소. 고객은 /notifications */
  href: string;
  unreadCount: number;
  className?: string;
};

export function NotificationBell({ href, unreadCount, className }: NotificationBellProps) {
  const badge = unreadBadgeText(unreadCount);
  return (
    <Link
      href={href}
      aria-label={badge ? `알림, 안 읽은 알림 ${badge}개` : '알림'}
      className={cn(
        'relative inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-foreground hover:bg-muted',
        className,
      )}
    >
      <Bell className="size-5" aria-hidden />
      {badge ? (
        <span
          aria-hidden
          className="absolute top-1 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground"
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
