'use client';

import { NotificationInbox } from '@/components/ui/notification-inbox';
import { NOTIFICATION_INBOX_TEXTS } from '@/components/ui/notification-inbox-rules';

import { OwnerPage } from '../owner-page';
import { OWNER_NOTIFICATION_ACCOUNT, OWNER_NOTIFICATIONS_EMPTY_HELP } from './owner-notifications';

/** 원장님 알림함 목록(#371). 제목 줄 오른쪽에 [모두 읽음]. 목록 동작은 공통 UI NotificationInbox다 */
export function OwnerNotificationInbox() {
  return (
    <NotificationInbox
      account={OWNER_NOTIFICATION_ACCOUNT}
      emptyHelp={OWNER_NOTIFICATIONS_EMPTY_HELP}
      frame={(markAll, body) => (
        <OwnerPage title={NOTIFICATION_INBOX_TEXTS.TITLE} width="wide" action={markAll}>
          {body}
        </OwnerPage>
      )}
    />
  );
}
