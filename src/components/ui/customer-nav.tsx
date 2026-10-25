'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from 'cn';
import { CalendarCheck, House, User } from 'lucide-react';

// 고객 화면 하단 메뉴(홈 / 내 예약 / 내 정보). 주소는 정찬형이 화면을 만들면서 바꿀 수 있다(바꾸면 여기만 고친다).
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
function NavItems({ pathname }: { pathname: string | null }) {
  return (
    <ul className="grid grid-cols-3">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname !== null && isActive(pathname, href);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-14 flex-col items-center justify-center gap-0.5 text-xs',
                active ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ActiveNavItems() {
  return <NavItems pathname={usePathname()} />;
}

export function CustomerBottomNav() {
  return (
    <nav
      aria-label="고객 메뉴"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[480px] border-t bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <Suspense fallback={<NavItems pathname={null} />}>
        <ActiveNavItems />
      </Suspense>
    </nav>
  );
}
