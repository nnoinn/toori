import { Suspense } from 'react';
import type { Metadata } from 'next';

import { NotificationRowsSkeleton } from '@/components/ui/notification-inbox';
import { NOTIFICATION_INBOX_TEXTS } from '@/components/ui/notification-inbox-rules';
import { ensureOwnerPage } from '@/server/auth';

import { OwnerPage } from '../owner-page';
import { OwnerNotificationInbox } from './owner-notification-inbox';
import { OWNER_NOTIFICATIONS_PATH } from './owner-notifications';

export const metadata: Metadata = { title: NOTIFICATION_INBOX_TEXTS.TITLE };

// 원장님 알림함 (#371, 11/17 정민석). 주소: /owner/notifications. 왼쪽 메뉴에는 넣지 않고 위 오른쪽 종으로 들어온다.
// 지금 원장님 모드의 알림만 보인다(NOTI-07). 로그인 확인은 <Suspense> 안에서 한다(기술 가이드 2장)
export default function OwnerNotificationsPage() {
  return (
    <Suspense fallback={<InboxFallback />}>
      <OwnerNotificationsContent />
    </Suspense>
  );
}

async function OwnerNotificationsContent() {
  // 로그인하지 않았으면 원장님 로그인 화면, 원장님 가입 전이면 /owner/join 으로 보낸다
  await ensureOwnerPage(OWNER_NOTIFICATIONS_PATH);
  return <OwnerNotificationInbox />;
}

function InboxFallback() {
  return (
    <OwnerPage title={NOTIFICATION_INBOX_TEXTS.TITLE} width="wide">
      <NotificationRowsSkeleton />
    </OwnerPage>
  );
}
