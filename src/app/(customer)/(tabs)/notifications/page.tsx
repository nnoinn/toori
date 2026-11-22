import { Suspense } from 'react';
import type { Metadata } from 'next';

import { NotificationRowsSkeleton } from '@/components/ui/notification-inbox';
import { NOTIFICATION_INBOX_TEXTS } from '@/components/ui/notification-inbox-rules';
import { ensureCustomerPage } from '@/server/auth';

import { CustomerInboxFrame, CustomerNotificationInbox } from './customer-notification-inbox';
import { NOTIFICATIONS_PATH } from './notification-rules';

export const metadata: Metadata = { title: NOTIFICATION_INBOX_TEXTS.TITLE };

// 고객 알림함 (#371). 주소: /notifications. 아래 메뉴가 있는 화면이지만 메뉴에는 넣지 않고 종으로 들어온다
// (PC는 위쪽 메뉴 오른쪽 종, 폰은 홈 화면 위 오른쪽 종, 11/15 nnoinn). 로그인 확인은 <Suspense> 안에서 한다(기술 가이드 2장).
// 지금 고객 모드의 알림만 보인다(NOTI-07)
export default function NotificationsPage() {
  return (
    <Suspense fallback={<InboxFallback />}>
      <NotificationsContent />
    </Suspense>
  );
}

async function NotificationsContent() {
  // 로그인하지 않았으면 로그인 화면, 약관 동의 전이면 /join 으로 보낸다
  await ensureCustomerPage(NOTIFICATIONS_PATH);
  return <CustomerNotificationInbox />;
}

function InboxFallback() {
  return (
    <CustomerInboxFrame>
      <NotificationRowsSkeleton />
    </CustomerInboxFrame>
  );
}
