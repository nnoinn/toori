'use client';

import { Button } from '@/components/ui/button';
import { useSignOut } from '@/components/ui/use-sign-out';

/**
 * 로그아웃 (X-101). 고객 계정과 원장님 계정은 같은 메일이어도 별개라서, 설정 화면에는 계정을 바꾸는 버튼을 두지 않는다
 * (11/10 nnoinn, #310). 다른 계정으로 가려면 로그아웃한 뒤 로그인 화면이나 첫 화면에서 고른다.
 * 로그아웃 순서(알림 구독 지우기 → 로그아웃 → 첫 화면을 새로 열기)는 원장님 로그아웃과 같은 useSignOut이 맡는다.
 * 로그아웃 뒤에는 고객 홈이 아니라 첫 화면(로그인과 로그인 없이 둘러보기)으로 간다(11/12 nnoinn, 점검 9-1)
 */
export function AccountActions() {
  const { signOutNow, pending, error } = useSignOut();

  return (
    <section className="flex flex-col gap-3 border-t pt-6" aria-label="계정">
      <h2 className="font-semibold">계정</h2>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="max-md:h-10"
          disabled={pending}
          onClick={signOutNow}
        >
          {pending ? '로그아웃 중…' : '로그아웃'}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
