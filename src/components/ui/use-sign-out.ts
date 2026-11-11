'use client';

import { useState, useTransition } from 'react';
import { unstable_rethrow } from 'next/navigation';

import { clearDevicePushSubscriptions } from '@/features/push/subscribe-push';
import { signOut } from '@/server/auth/session';

const FAILED_MESSAGE = '로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요';

/**
 * 고객 내 정보와 원장님 메뉴·내 계정의 로그아웃 버튼이 같이 쓰는 로그아웃 순서(X-101, #131, 11/11).
 * 1) 이 기기의 내 알림 구독(고객·원장님 모두)을 지운다. 로그인이 풀리면 지울 수 없어서 먼저 한다(실패해도 로그아웃은 한다)
 * 2) 로그아웃(signOut)
 * 3) redirectTo로 화면 전체를 새로 연다. 앱 안 이동(router)으로 가면 브라우저에 남아 있던 로그인 상태 화면이 잠깐 보였다가
 *    조금 뒤에야 로그아웃된 모습으로 바뀌고, 뒤로 가기로 내 정보가 다시 보일 수도 있다. 새로 열면 남은 화면이 모두 지워진다
 * pending은 새 화면이 열릴 때까지 true라서 버튼이 그동안 '로그아웃 중…'으로 잠겨 있다
 */
export function useSignOut(redirectTo: string) {
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [pending, startTransition] = useTransition();

  function signOutNow() {
    setError(null);
    startTransition(async () => {
      try {
        await clearDevicePushSubscriptions();
        const result = await signOut();
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        setLeaving(true);
        // 지금 화면은 기록에서 빼서 뒤로 가기로 돌아오지 않게 한다
        window.location.replace(redirectTo);
      } catch (caught) {
        unstable_rethrow(caught);
        setError(FAILED_MESSAGE);
      }
    });
  }

  return { signOutNow, pending: pending || leaving, error };
}
