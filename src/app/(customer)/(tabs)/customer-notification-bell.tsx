'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

import { NotificationBell } from '@/components/ui/notification-bell';

// 지금은 가짜 결과 버전(#371). 진짜 함수가 들어오면 이 import만 바꾼다
import { countMyUnreadNotifications } from './notifications/fake-actions';
import { NOTIFICATIONS_PATH, NOTIFICATIONS_READ_EVENT } from './notifications/notification-rules';

/**
 * 고객 알림함으로 가는 종과 안 읽은 수 (#371). PC는 위쪽 메뉴 오른쪽, 폰은 홈 화면 위 오른쪽에만 둔다(11/15 nnoinn).
 * 로그인 안 함·원장님 모드(안 읽은 수 null)면 숨긴다. 수를 읽지 못하면 숫자 없이 종만 둔다(알림함에는 들어갈 수 있게)
 */
export function CustomerNotificationBell({ className }: { className?: string }) {
  // 지금 주소(usePathname)를 읽는 부분만 <Suspense>로 감싼다(Cache Components, customer-nav와 같은 방식)
  return (
    <Suspense fallback={null}>
      <BellLoader className={className} />
    </Suspense>
  );
}

/** 화면을 옮길 때, 다른 앱에 갔다가 돌아올 때, 알림함에서 읽음으로 바꿨을 때 안 읽은 수를 다시 묻는다(결제 중 막대와 같은 방식) */
function BellLoader({ className }: { className?: string }) {
  const pathname = usePathname();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const result = await countMyUnreadNotifications();
        if (ignore) return;
        if (result.ok) setCount(result.data);
        else setCount((prev) => prev ?? 0);
      } catch {
        // 읽지 못하면 지금 표시를 그대로 둔다. 다음 화면 이동 때 다시 묻는다
      }
    }
    function handleVisible() {
      if (document.visibilityState === 'visible') void load();
    }
    function handleRead() {
      void load();
    }
    void load();
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener(NOTIFICATIONS_READ_EVENT, handleRead);
    return () => {
      ignore = true;
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener(NOTIFICATIONS_READ_EVENT, handleRead);
    };
  }, [pathname]);

  if (count === null) return null;
  return <NotificationBell href={NOTIFICATIONS_PATH} unreadCount={count} className={className} />;
}
