'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from 'cn';
import { Lock, Menu, type LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

export type SideNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** true면 잠금 표시하고 누를 수 없다(예: 입점 승인 전 '매물 등록') */
  locked?: boolean;
  /** 잠긴 이유. 화면에 작게 보여준다 */
  lockedReason?: string;
};

type SideNavProps = {
  /** 메뉴 제목. 예: '원장님', '운영자' */
  title: string;
  items: SideNavItem[];
  /** 가장 바깥 주소. 이 주소는 정확히 같을 때만 선택 표시한다. 예: '/owner' */
  rootHref: string;
};

function NavLinks({
  items,
  rootHref,
  onNavigate,
}: Omit<SideNavProps, 'title'> & { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <ul className="flex flex-col gap-1">
      {items.map(({ href, label, icon: Icon, locked, lockedReason }) => {
        const active =
          href === rootHref
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);
        if (locked) {
          return (
            <li key={href}>
              <span
                aria-disabled="true"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground"
              >
                <Icon className="size-4" aria-hidden />
                <span className="flex-1">{label}</span>
                <Lock className="size-3.5" aria-label="잠김" />
              </span>
              {lockedReason ? (
                <p className="px-3 pb-1 text-xs text-muted-foreground">{lockedReason}</p>
              ) : null}
            </li>
          );
        }
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
                active ? 'bg-muted font-semibold' : 'text-muted-foreground hover:bg-muted/60',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** 업주·운영자 화면 메뉴. PC는 왼쪽 고정 메뉴, 폰은 위쪽 막대의 메뉴 버튼으로 연다 */
export function SideNav({ title, items, rootHref }: SideNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <aside className="hidden w-56 shrink-0 border-r p-4 md:block" aria-label={`${title} 메뉴`}>
        <p className="mb-4 px-3 font-bold">{title}</p>
        <NavLinks items={items} rootHref={rootHref} />
      </aside>

      <div className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background px-4 md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="메뉴 열기">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-4">
            <SheetHeader className="p-0">
              <SheetTitle className="px-3">{title}</SheetTitle>
            </SheetHeader>
            <NavLinks items={items} rootHref={rootHref} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <p className="font-bold">{title}</p>
      </div>
    </>
  );
}
