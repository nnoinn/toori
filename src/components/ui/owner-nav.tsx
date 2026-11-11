'use client';

import { useState, useTransition } from 'react';
import { unstable_rethrow, useRouter } from 'next/navigation';
import { LayoutDashboard, LogOut, SquarePlus, Store, UserRound, Wallet } from 'lucide-react';
import { cn } from 'cn';

import { Button } from '@/components/ui/button';
import { SideNav } from '@/components/ui/side-nav';
import { clearDevicePushSubscriptions } from '@/features/push/subscribe-push';
import { loginPath } from '@/server/auth/paths';
import { signOut } from '@/server/auth/session';

type OwnerNavProps = {
  /** 입점 승인 전이면 false. '매물 등록'을 잠근다(S-102). 서버에서도 따로 막아야 한다 */
  canCreateSlot?: boolean;
};

// 원장님 메뉴(대시보드 / 매물 등록 / 매장 설정 / 내 계정 / 정산). 주소는 정민석이 화면을 만들면서 바꿀 수 있다(바꾸면 여기만 고친다).
// 왼쪽 아래에 로그아웃(O7 ①). 내 계정 화면(#307)에도 같은 로그아웃 버튼(OwnerSignOutButton)이 있다
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
        // 로그인 계정, 이 기기 알림(O12), 고객센터, 로그아웃(#307)
        { href: '/owner/account', label: '내 계정', icon: UserRound },
        // 정산 내역(O15)을 만들면 locked를 지운다
        {
          href: '/owner/settlements',
          label: '정산',
          icon: Wallet,
          locked: true,
          lockedReason: '준비 중이에요',
        },
      ]}
      footer={<OwnerSignOutButton />}
    />
  );
}

const FAILED_MESSAGE = '로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요';

/**
 * 원장님 로그아웃. 메뉴 아래와 내 계정 화면(#307)이 같이 쓴다. 로그아웃하고 원장님 로그인 화면으로 보낸다(다른 계정으로 들어갈 수 있게).
 * 로그아웃 전에 이 기기의 내 알림 구독(고객·원장님 모두)을 지운다(#131). 로그인이 풀리면 지울 수 없어서 순서가 중요하다.
 * 지우지 못해도 로그아웃은 한다(clearDevicePushSubscriptions가 실패를 삼킨다)
 */
export function OwnerSignOutButton({
  variant = 'nav',
}: {
  /** nav: 왼쪽 메뉴 아래(글자 버튼), page: 내 계정 화면(테두리 버튼) */
  variant?: 'nav' | 'page';
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function logOut() {
    setError(null);
    startTransition(async () => {
      try {
        await clearDevicePushSubscriptions();
        const result = await signOut();
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        router.replace(loginPath('owner'));
        router.refresh();
      } catch (caught) {
        unstable_rethrow(caught);
        setError(FAILED_MESSAGE);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant={variant === 'nav' ? 'ghost' : 'outline'}
        size={variant === 'nav' ? 'default' : 'lg'}
        className={cn(
          'gap-2',
          variant === 'nav' && 'w-full justify-start px-3 text-muted-foreground',
          variant === 'page' && 'w-fit',
        )}
        disabled={pending}
        onClick={logOut}
      >
        <LogOut className="size-4" aria-hidden />
        {pending ? '로그아웃 중…' : '로그아웃'}
      </Button>
      {error ? (
        <p role="alert" className={cn('text-xs text-destructive', variant === 'nav' && 'px-3')}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
