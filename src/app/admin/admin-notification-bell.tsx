'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import {
  NotificationBell,
  NotificationPanelItem,
  NotificationPanelMessage,
} from '@/components/ui/notification-bell';
import { formatKstDateTime } from '@/lib/time';
import { getNotificationIssueBell } from '@/server/admin/notification-issues';
import type { RecentNotificationIssue } from '@/server/admin/notification-issues-store';

import {
  NOTIFICATION_ISSUE_TAB_LABELS,
  NOTIFICATION_ISSUES_PATH,
  notificationIssuesHref,
} from './notifications/format';

type Bell = { failedCount: number; items: RecentNotificationIssue[] };

/**
 * 운영자 화면 위 오른쪽 알림 종 (#373 ⑤, 11/16 nnoinn). 숫자는 보내지 못한 알림 수(최근 90일)다.
 * 누르면 바로 아래 상자에 최근 알림 5개(보내지 못함·기기 없음)와 [알림 확인으로 가기]가 뜬다.
 * 화면을 옮길 때와 다른 앱에 갔다가 돌아올 때 다시 묻는다. 운영자로 들어오지 않았거나 읽지 못하면 그리지 않는다
 */
export function AdminNotificationBell() {
  // 지금 주소(usePathname)를 읽는 부분만 <Suspense>로 감싼다(Cache Components)
  return (
    <Suspense fallback={null}>
      <BellLoader />
    </Suspense>
  );
}

function BellLoader() {
  const pathname = usePathname();
  const router = useRouter();
  const [bell, setBell] = useState<Bell | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const result = await getNotificationIssueBell();
        if (!ignore && result.ok) setBell(result.data);
      } catch {
        // 읽지 못하면 지금 표시를 그대로 둔다. 다음 화면 이동 때 다시 묻는다
      }
    }
    function handleVisible() {
      if (document.visibilityState === 'visible') void load();
    }
    void load();
    document.addEventListener('visibilitychange', handleVisible);
    return () => {
      ignore = true;
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [pathname]);

  if (!bell) return null;
  return (
    <NotificationBell
      href={NOTIFICATION_ISSUES_PATH}
      unreadCount={bell.failedCount}
      footerLabel="알림 확인으로 가기"
      panel={(close) =>
        bell.items.length === 0 ? (
          <NotificationPanelMessage>푸시 알림이 가지 않은 알림이 없어요</NotificationPanelMessage>
        ) : (
          <ul className="divide-y">
            {bell.items.map((item) => (
              <li key={item.notificationId}>
                <NotificationPanelItem
                  title={item.title || '(제목 없음)'}
                  meta={`${NOTIFICATION_ISSUE_TAB_LABELS[item.status]} · ${formatKstDateTime(item.createdAt)}`}
                  onSelect={() => {
                    close();
                    router.push(notificationIssuesHref({ tab: item.status }));
                  }}
                />
              </li>
            ))}
          </ul>
        )
      }
    />
  );
}
