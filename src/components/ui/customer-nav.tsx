'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from 'cn';
import { CalendarCheck, House, User } from 'lucide-react';

import { Logo } from '@/components/ui/logo';

// 고객 화면 메뉴(홈 / 내 예약 / 내 정보). 폰은 아래 메뉴(CustomerBottomNav), PC(md 이상)는 위쪽 메뉴(CustomerTopNav). 주소는 정찬형이 화면을 만들면서 바꿀 수 있다(바꾸면 여기만 고친다).
const ITEMS = [
  { href: '/', label: '홈', icon: House },
  { href: '/reservations', label: '내 예약', icon: CalendarCheck },
  { href: '/me', label: '내 정보', icon: User },
] as const;

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

// 지금 주소(usePathname)는 주소가 바뀌는 화면(예: /slots/[slotId])에서 미리 만들 때 알 수 없어서,
// 읽는 부분만 <Suspense>로 감싼다(Cache Components). 그동안은 선택 표시 없는 메뉴를 보여준다.
type Variant = 'bottom' | 'top';

function NavItems({ pathname, variant }: { pathname: string | null; variant: Variant }) {
  return (
    <ul className={variant === 'bottom' ? 'grid grid-cols-3' : 'flex items-center gap-1'}>
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname !== null && isActive(pathname, href);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                variant === 'bottom'
                  ? 'flex h-14 flex-col items-center justify-center gap-0.5 text-xs'
                  : 'flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm hover:bg-muted',
                active ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}
            >
              <Icon className={variant === 'bottom' ? 'size-5' : 'size-4'} aria-hidden />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ActiveNavItems({ variant }: { variant: Variant }) {
  return <NavItems pathname={usePathname()} variant={variant} />;
}

/** 폰 아래 메뉴. PC(md 이상)에서는 숨기고 CustomerTopNav를 쓴다 */
export function CustomerBottomNav() {
  return (
    <nav
      aria-label="고객 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[480px] border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <Suspense fallback={<NavItems pathname={null} variant="bottom" />}>
        <ActiveNavItems variant="bottom" />
      </Suspense>
    </nav>
  );
}

/** PC(md 이상) 위쪽 메뉴. 왼쪽에 로고, 오른쪽에 메뉴. 폰에서는 숨긴다 */
export function CustomerTopNav() {
  return (
    <header className="sticky top-0 z-40 hidden h-16 border-b bg-card md:block">
      <div className="flex h-full w-full items-center justify-between px-6">
        <Link href="/" className="flex items-center">
          <Logo className="h-7" />
        </Link>
        <nav aria-label="고객 메뉴">
          <Suspense fallback={<NavItems pathname={null} variant="top" />}>
            <ActiveNavItems variant="top" />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}
