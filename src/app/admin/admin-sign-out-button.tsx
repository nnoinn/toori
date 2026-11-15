'use client';

import { Button } from '@/components/ui/button';
import { useSignOut } from '@/components/ui/use-sign-out';
import { ADMIN_LOGIN_PATH } from '@/server/auth/paths';

/**
 * 운영자 로그아웃 (#372 3장). 고객·원장님 로그아웃과 같은 순서(이 기기 알림 구독 지우기 → 로그아웃 → 새 화면으로 열기)이고,
 * 로그아웃 뒤에는 운영자 입구를 새로 연다
 */
export function AdminSignOutButton() {
  const { signOutNow, pending, error } = useSignOut(ADMIN_LOGIN_PATH);
  return (
    <div className="flex items-center gap-2">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={signOutNow}>
        {pending ? '로그아웃 중…' : '로그아웃'}
      </Button>
    </div>
  );
}
