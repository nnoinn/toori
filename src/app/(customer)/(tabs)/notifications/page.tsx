import { Suspense } from 'react';
import type { Metadata } from 'next';

import { ensureCustomerPage } from '@/server/auth';

import { NotificationInbox, NotificationRowsSkeleton } from './notification-inbox';
import { NOTIFICATION_TEXTS, NOTIFICATIONS_PATH } from './notification-rules';

export const metadata: Metadata = { title: NOTIFICATION_TEXTS.TITLE };

// 고객 알림함 (#371). 주소: /notifications. 아래 메뉴가 있는 화면이지만 메뉴에는 넣지 않고 종으로 들어온다
// (PC는 위쪽 메뉴 오른쪽 종, 폰은 홈 화면 위 오른쪽 종, 11/15 nnoinn). 로그인 확인은 <Suspense> 안에서 한다(기술 가이드 2장)
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
  return <NotificationInbox />;
}

function InboxFallback() {
  return (
    <main className="flex flex-1 flex-col md:mx-auto md:w-full md:max-w-3xl md:px-6 md:py-6">
      <h1 className="px-4 py-4 text-xl font-bold md:px-0 md:pt-0">{NOTIFICATION_TEXTS.TITLE}</h1>
      <NotificationRowsSkeleton />
    </main>
  );
}
