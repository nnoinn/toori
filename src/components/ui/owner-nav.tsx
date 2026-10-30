'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutDashboard, LogOut, SquarePlus, Store, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SideNav } from '@/components/ui/side-nav';
import { loginPath } from '@/server/auth/paths';
import { signOut } from '@/server/auth/session';

type OwnerNavProps = {
  /** 입점 승인 전이면 false. '매물 등록'을 잠근다(S-102). 서버에서도 따로 막아야 한다 */
  canCreateSlot?: boolean;
};

// 원장님 메뉴(대시보드 / 매물 등록 / 매장 설정 / 정산). 주소는 정민석이 화면을 만들면서 바꿀 수 있다(바꾸면 여기만 고친다).
// 왼쪽 아래에 로그아웃(O7 ①, 원장님 화면에는 고객 '내 정보' 같은 곳이 없어서 메뉴에 둔다)
export function OwnerNav({ canCreateSlot = true }: OwnerNavProps) {
  return (
    <SideNav
      title="원장님"
      rootHref="/owner"
      items={[
        { href: '/owner', label: '대시보드', icon: LayoutDashboard },
        {
          href: '/owner/slots/new',
          label: '매물 등록',
          icon: SquarePlus,
          locked: !canCreateSlot,
          lockedReason: '입점 승인 후에 등록할 수 있어요',
        },
        { href: '/owner/settings', label: '매장 설정', icon: Store },
        { href: '/owner/settlements', label: '정산', icon: Wallet },
      ]}
      footer={<SignOutButton />}
    />
  );
}

/** 로그아웃하고 원장님 로그인 화면으로 보낸다(다른 계정으로 들어갈 수 있게) */
function SignOutButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function logOut() {
    setError(null);
    startTransition(async () => {
      const result = await signOut();
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.replace(loginPath('owner'));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="ghost"
        className="w-full justify-start gap-2 px-3 text-muted-foreground"
        disabled={pending}
        onClick={logOut}
      >
        <LogOut className="size-4" aria-hidden />
        {pending ? '로그아웃 중…' : '로그아웃'}
      </Button>
      {error ? (
        <p role="alert" className="px-3 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
