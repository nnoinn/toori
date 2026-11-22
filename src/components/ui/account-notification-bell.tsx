'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import {
  countMyUnreadNotifications,
  listMyNotifications,
  markNotificationsRead,
} from '@/server/notifications/inbox';
import {
  type MyNotification,
  NOTIFICATIONS_BELL_COUNT,
  NOTIFICATIONS_CHANGED_EVENT,
  type NotificationAccount,
} from '@/server/notifications/inbox-types';

import {
  NotificationBell,
  NotificationPanelItem,
  NotificationPanelMessage,
} from './notification-bell';
import {
  NOTIFICATION_INBOX_TEXTS as TEXTS,
  notificationHref,
  notificationTimeText,
} from './notification-inbox-rules';

// 계정 알림 종 (#371). 원장님 화면 위 오른쪽(11/17 정민석)과 고객 화면(PC 위쪽 메뉴·폰 홈 화면, 11/20 정찬형)이 같이 쓴다.
// 숫자는 그 계정의 안 읽은 알림 수. 누르면 바로 아래 상자에 최근 알림 5개와 [알림함으로 가기]가 뜬다(11/16 nnoinn).
// 로그인 안 함·다른 계정 모드(안 읽은 수 null)면 숨긴다. 수를 읽지 못하면 숫자 없이 종만 둔다(알림함에는 들어갈 수 있게)

type AccountNotificationBellProps = {
  account: NotificationAccount;
  /** 알림함 주소. 원장님은 /owner/notifications */
  href: string;
  className?: string;
};

export function AccountNotificationBell(props: AccountNotificationBellProps) {
  // 지금 주소(usePathname)를 읽는 부분만 <Suspense>로 감싼다(Cache Components)
  return (
    <Suspense fallback={null}>
      <BellLoader {...props} />
    </Suspense>
  );
}

/** 화면을 옮길 때, 다른 앱에 갔다가 돌아올 때, 알림함에서 읽음으로 바꿨을 때·화면 안내가 떴을 때 안 읽은 수를 다시 묻는다 */
function BellLoader({ account, href, className }: AccountNotificationBellProps) {
  const pathname = usePathname();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const result = await countMyUnreadNotifications(account);
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
    function handleChanged() {
      void load();
    }
    void load();
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, handleChanged);
    return () => {
      ignore = true;
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, handleChanged);
    };
  }, [account, pathname]);

  if (count === null) return null;
  return (
    <NotificationBell
      href={href}
      unreadCount={count}
      className={className}
      panel={(close) => <RecentNotifications account={account} close={close} />}
    />
  );
}

type RecentState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; items: MyNotification[]; serverNow: string };

/**
 * 종 아래 상자: 최근 알림 5개(최신 순). 상자를 열 때마다 새로 불러온다.
 * 줄을 누르면 상자를 닫고 읽음으로 바꾼 뒤 그 화면으로 간다(알림함과 같음, 읽음 처리가 실패해도 이동한다)
 */
function RecentNotifications({
  account,
  close,
}: {
  account: NotificationAccount;
  close: () => void;
}) {
  const router = useRouter();
  const [state, setState] = useState<RecentState>({ kind: 'loading' });

  useEffect(() => {
    let ignore = false;
    listMyNotifications({ limit: NOTIFICATIONS_BELL_COUNT }, account)
      .then((result) => {
        if (ignore) return;
        setState(
          result.ok
            ? { kind: 'ready', items: result.data.items, serverNow: result.data.serverNow }
            : { kind: 'error' },
        );
      })
      .catch(() => {
        if (!ignore) setState({ kind: 'error' });
      });
    return () => {
      ignore = true;
    };
  }, [account]);

  function open(item: MyNotification) {
    close();
    if (item.readAt === null) {
      markNotificationsRead({ ids: [item.id] }, account)
        .then(() => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT)))
        .catch(() => {});
    }
    const href = notificationHref(item.url);
    if (href) router.push(href);
  }

  if (state.kind === 'loading')
    return <NotificationPanelMessage>{TEXTS.LOADING}</NotificationPanelMessage>;
  if (state.kind === 'error') {
    return <NotificationPanelMessage>{TEXTS.LOAD_FAILED}</NotificationPanelMessage>;
  }
  if (state.items.length === 0) {
    return <NotificationPanelMessage>{TEXTS.EMPTY}</NotificationPanelMessage>;
  }
  return (
    <ul className="divide-y">
      {state.items.map((item) => (
        <li key={item.id}>
          <NotificationPanelItem
            title={item.title}
            body={item.body}
            meta={notificationTimeText(item.createdAt, state.serverNow)}
            unread={item.readAt === null}
            onSelect={() => open(item)}
          />
        </li>
      ))}
    </ul>
  );
}
