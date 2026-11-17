'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';

import { listMyNotificationsSince } from '@/server/notifications/inbox';
import {
  type MyNotification,
  NOTIFICATIONS_CHANGED_EVENT,
  type NotificationAccount,
} from '@/server/notifications/inbox-types';
import { NOTIFICATION_CHECK_SECONDS, NOTIFICATION_TOAST_SECONDS } from '@/server/policy';

import {
  parseSeen,
  pickToastItems,
  pushToastAction,
  rememberSeen,
} from './notification-toast-rules';

// 화면 안내 (#371, 11/13 nnoinn). 고객·원장님 화면 틀이 한 번 둔다(예: 고객은 src/app/(customer)/layout.tsx).
// 이미 본 알림 id는 이 탭에서만 기억한다(sessionStorage). 새로 고침해도 같은 알림이 다시 뜨지 않게 하려는 것이라 못 읽어도 동작한다.
// 푸시 알림을 켠 기기는 서비스 워커(public/sw.js)가 푸시를 받자마자 이 계정의 화면 안내에 알려서 바로 묻는다. 물어서 답을 받았으면
// "띄웠다"고 돌려주고, 크롬 계열은 그때 기기 알림을 띄우지 않는다(두 번 뜨지 않게, #371)

function seenKey(account: NotificationAccount) {
  return `toori:notification-toast-seen:${account}`;
}

function readSeen(account: NotificationAccount): string[] {
  try {
    return parseSeen(sessionStorage.getItem(seenKey(account)));
  } catch {
    return [];
  }
}

function writeSeen(account: NotificationAccount, ids: string[]) {
  try {
    sessionStorage.setItem(seenKey(account), JSON.stringify(ids));
  } catch {
    // 기억하지 못해도 화면 안내는 뜬다
  }
}

type Shown = { item: MyNotification; more: number };

/**
 * 투리를 보고 있을 때 1분마다 새 알림을 확인해서, 새 알림이 있으면 화면 위 가운데에 5초 동안 보여 준다.
 * 푸시 알림을 켰는지와 상관없이 뜨고(NOTI-06), 누르면 알림함으로 간다. 지금 계정 모드의 알림만 본다.
 * 화면을 다시 보면(다른 앱에 갔다 오면) 바로 한 번 확인하고, 화면을 보고 있지 않으면 확인을 멈춘다.
 * 로그인하지 않았거나 다른 계정 모드면 확인을 멈추고, 화면을 다시 볼 때 한 번 더 묻는다.
 * 서비스 워커가 이 계정의 푸시를 받았다고 알리면(pushToastAction) 기다리지 않고 바로 묻고, 물었는지를 답한다
 */
export function NotificationToaster({
  account,
  inboxHref,
}: {
  account: NotificationAccount;
  /** 알림함 주소. 고객은 /notifications */
  inboxHref: string;
}) {
  const [shown, setShown] = useState<Shown | null>(null);
  // 다음 확인의 기준. 지난 확인의 서버 시각이고, 처음에는 이 기기 시각이다
  const since = useRef<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let disposed = false;

    function stop() {
      if (timer !== null) clearInterval(timer);
      timer = null;
    }

    /** 새 알림을 묻고 화면 안내를 띄운다. 물어서 답을 받았으면 true(새 알림이 없거나 이미 띄운 알림이어도 true) */
    async function check(): Promise<boolean> {
      try {
        const result = await listMyNotificationsSince(
          since.current ?? new Date().toISOString(),
          account,
        );
        if (disposed) return false;
        if (!result.ok) {
          stop();
          return false;
        }
        since.current = result.data.serverNow;
        const seen = readSeen(account);
        const fresh = pickToastItems(result.data.items, new Set(seen), result.data.serverNow);
        writeSeen(account, rememberSeen(seen, result.data.items));
        if (fresh.length === 0) return true;
        setShown({ item: fresh[0], more: fresh.length - 1 });
        // 종이 안 읽은 수를 다시 묻는다
        window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
        return true;
      } catch {
        // 확인하지 못하면 다음 번에 다시 묻는다
        return false;
      }
    }

    /** 서비스 워커가 이 계정의 푸시를 받았다고 알리면 바로 묻고, 같이 온 포트로 물었는지 답한다 */
    function handlePush(event: MessageEvent) {
      // 다른 앱을 보는 중이면 창이 보여도 포커스가 없다. 그때는 기기 알림이 뜨게 아니라고 답한다
      const action = pushToastAction(event.data, {
        account,
        watching: document.visibilityState === 'visible' && document.hasFocus(),
      });
      if (action === 'ignore') return;
      const port = event.ports[0];
      if (action === 'decline') {
        port?.postMessage({ shown: false });
        return;
      }
      void check().then((shown) => port?.postMessage({ shown }));
    }

    function start() {
      if (timer !== null) return;
      void check();
      timer = setInterval(() => void check(), NOTIFICATION_CHECK_SECONDS * 1000);
    }

    function handleVisibility() {
      if (document.visibilityState === 'visible') start();
      else stop();
    }

    handleVisibility();
    document.addEventListener('visibilitychange', handleVisibility);
    // 서비스 워커를 쓰지 않는 브라우저면 1분마다 묻기만 한다
    const worker = 'serviceWorker' in navigator ? navigator.serviceWorker : null;
    worker?.addEventListener('message', handlePush);
    return () => {
      disposed = true;
      stop();
      document.removeEventListener('visibilitychange', handleVisibility);
      worker?.removeEventListener('message', handlePush);
    };
  }, [account]);

  useEffect(() => {
    if (!shown) return;
    const timeout = setTimeout(() => setShown(null), NOTIFICATION_TOAST_SECONDS * 1000);
    return () => clearTimeout(timeout);
  }, [shown]);

  if (!shown) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[calc(0.75rem+env(safe-area-inset-top))] z-50 flex justify-center px-4"
    >
      <Link
        href={inboxHref}
        onClick={() => setShown(null)}
        className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl bg-foreground px-4 py-3 text-sm text-background shadow-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Bell className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-semibold">{shown.item.title}</span>
          {shown.item.body ? (
            <span className="line-clamp-2 opacity-80">{shown.item.body}</span>
          ) : null}
          {shown.more > 0 ? (
            <span className="text-xs opacity-70">새 알림이 {shown.more}개 더 있어요</span>
          ) : null}
        </span>
      </Link>
    </div>
  );
}
