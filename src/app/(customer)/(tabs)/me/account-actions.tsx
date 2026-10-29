'use client';

import { useState, useTransition } from 'react';
import { unstable_rethrow, useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { signOut, switchAccountMode } from '@/server/auth/session';

const FAILED_MESSAGE = '처리하지 못했어요. 잠시 후 다시 시도해 주세요';

/**
 * 원장님 계정으로 바꾸기, 로그아웃 (X-101). 두 계정은 정보·예약·정산이 완전히 나뉘어 있다.
 * 원장님 계정이 없으면 원장님 가입 화면으로 보낸다(switchAccountMode의 hasAccount)
 */
export function AccountActions({ hasOwnerAccount }: { hasOwnerAccount: boolean }) {
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

  function toOwner() {
    run(async () => {
      const result = await switchAccountMode('owner');
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.push(result.data.hasAccount ? '/owner' : '/owner/join');
    });
  }

  function logOut() {
    run(async () => {
      const result = await signOut();
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.replace('/');
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3 border-t pt-6" aria-label="계정">
      <h2 className="font-semibold">계정</h2>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={toOwner}>
          {hasOwnerAccount ? '원장님 계정으로 바꾸기' : '원장님으로 시작하기'}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={logOut}>
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
