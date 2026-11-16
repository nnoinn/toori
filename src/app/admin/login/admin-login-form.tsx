'use client';

import { useState, useTransition } from 'react';
import { unstable_rethrow } from 'next/navigation';

import { PROVIDER_ORDER, ProviderButton, type ProviderKey } from '@/components/ui/provider-button';
import { signInWithProvider } from '@/server/auth/session';

import { ADMIN_LOGIN_START_FAILED_MESSAGE } from './admin-login-texts';

/**
 * 운영자 입구의 간편 로그인 버튼 (#372 1장). 고객·원장님과 같은 카카오·네이버·구글 로그인이고(같은 순서), 운영자 모드로 들어온다.
 * 운영자 전용 아이디·비밀번호는 만들지 않는다("간편 로그인만" 규칙)
 */
export function AdminLoginForm({
  next,
  error,
  recentProvider = null,
}: {
  next: string;
  error: string | null;
  /** 이 기기에서 가장 최근에 로그인한 방식. 그 버튼에 "최근 로그인" 표시를 한다(AUTH-14) */
  recentProvider?: ProviderKey | null;
}) {
  const [message, setMessage] = useState<string | null>(error);
  const [pendingProvider, setPendingProvider] = useState<ProviderKey | null>(null);
  const [, startTransition] = useTransition();

  function start(provider: ProviderKey) {
    setMessage(null);
    setPendingProvider(provider);
    startTransition(async () => {
      try {
        // 성공하면 서버가 카카오·구글·네이버로 보내서 아래로 내려오지 않는다
        const result = await signInWithProvider({ provider, mode: 'admin', next });
        if (!result.ok) {
          setMessage(result.error.message);
          setPendingProvider(null);
        }
      } catch (caught) {
        unstable_rethrow(caught);
        setMessage(ADMIN_LOGIN_START_FAILED_MESSAGE);
        setPendingProvider(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {PROVIDER_ORDER.map((provider) => (
        <ProviderButton
          key={provider}
          provider={provider}
          disabled={pendingProvider !== null}
          pending={pendingProvider === provider}
          recent={recentProvider === provider}
          onClick={() => start(provider)}
        />
      ))}
      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}
