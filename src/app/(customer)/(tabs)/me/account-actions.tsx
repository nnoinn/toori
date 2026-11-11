'use client';

import { useState, useTransition } from 'react';
import { unstable_rethrow, useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { clearDevicePushSubscriptions } from '@/features/push/subscribe-push';
import { CUSTOMER_HOME } from '@/server/auth/paths';
import { signOut } from '@/server/auth/session';

const FAILED_MESSAGE = '처리하지 못했어요. 잠시 후 다시 시도해 주세요';

/**
 * 로그아웃 (X-101). 고객 계정과 원장님 계정은 같은 메일이어도 별개라서, 설정 화면에는 계정을 바꾸는 버튼을 두지 않는다
 * (11/10 nnoinn, #310). 다른 계정으로 가려면 로그아웃한 뒤 로그인 화면이나 첫 화면에서 고른다
 */
export function AccountActions() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
      } catch (caught) {
        unstable_rethrow(caught);
        setError(FAILED_MESSAGE);
      }
    });
  }

  function logOut() {
    run(async () => {
      // 로그아웃 전에 이 기기의 내 알림 구독(고객·원장님 모두)을 지운다(#131). 로그인이 풀리면 지울 수 없다
      await clearDevicePushSubscriptions();
      const result = await signOut();
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.replace(CUSTOMER_HOME);
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3 border-t pt-6" aria-label="계정">
      <h2 className="font-semibold">계정</h2>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={logOut}>
          로그아웃
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
