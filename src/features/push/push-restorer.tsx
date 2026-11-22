'use client';

import { useEffect } from 'react';

import { restorePushAfterSignIn } from './subscribe-push';

/**
 * 로그아웃 뒤 다시 로그인하면 이 기기의 푸시 알림을 되살린다(11/23 nnoinn, push-restore.ts). 고객·원장님 화면 틀이 한 번 둔다.
 * 로그아웃 때 기억해 둔 것이 없으면 아무 일도 하지 않고, 아무것도 그리지 않는다
 */
export function PushRestorer() {
  useEffect(() => {
    void restorePushAfterSignIn();
  }, []);
  return null;
}
