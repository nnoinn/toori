'use client';

import { BackButton } from '@/components/ui/back-button';
import { NotificationInbox } from '@/components/ui/notification-inbox';
import { NOTIFICATION_INBOX_TEXTS } from '@/components/ui/notification-inbox-rules';
import { CUSTOMER_HOME } from '@/server/auth/paths';

import {
  CUSTOMER_NOTIFICATION_ACCOUNT,
  CUSTOMER_NOTIFICATIONS_EMPTY_HELP,
} from './notification-rules';

/**
 * 고객 알림함 목록(#371). 목록 동작은 공통 UI NotificationInbox다(원장님 알림함과 같음, 11/20 정찬형).
 * 제목 줄 오른쪽에 [모두 읽음], 폰은 왼쪽에 뒤로 가기. 틀은 아래 CustomerInboxFrame
 */
export function CustomerNotificationInbox() {
  return (
    <NotificationInbox
      account={CUSTOMER_NOTIFICATION_ACCOUNT}
      emptyHelp={CUSTOMER_NOTIFICATIONS_EMPTY_HELP}
      frame={(markAll, body) => <CustomerInboxFrame action={markAll}>{body}</CustomerInboxFrame>}
    />
  );
}

/**
 * 고객 알림함 틀. PC는 가운데 최대 768px, 폰은 양옆 16px 안쪽에 흰 카드(다른 고객 화면처럼 회색 배경 위 카드).
 * 불러오는 동안(page.tsx의 <Suspense> 대기 화면)에도 같은 틀을 쓴다
 */
export function CustomerInboxFrame({
  action,
  children,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="flex flex-1 flex-col md:mx-auto md:w-full md:max-w-3xl md:px-6 md:py-6">
      <div className="flex items-center gap-1 px-2 py-2 md:px-0 md:pt-0">
        <BackButton fallbackHref={CUSTOMER_HOME} className="md:hidden" />
        <h1 className="flex-1 px-2 text-xl font-bold md:px-0">{NOTIFICATION_INBOX_TEXTS.TITLE}</h1>
        {action}
      </div>
      <div className="flex flex-col gap-3 px-4 pb-4 md:px-0">{children}</div>
    </main>
  );
}
