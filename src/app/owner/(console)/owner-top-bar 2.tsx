import { AccountNotificationBell } from '@/components/ui/account-notification-bell';

import {
  OWNER_NOTIFICATION_ACCOUNT,
  OWNER_NOTIFICATIONS_PATH,
} from './notifications/owner-notifications';

/**
 * 원장님 화면 위 오른쪽의 알림 종(#371, 11/17 정민석. 운영자 화면 위 막대와 같은 자리).
 * 종은 원장님 모드일 때만 그려진다. 높이를 정해 둬서 종이 늦게 들어와도 본문이 밀리지 않는다
 */
export function OwnerTopBar() {
  return (
    <div className="flex h-14 items-center justify-end border-b px-6">
      <AccountNotificationBell
        account={OWNER_NOTIFICATION_ACCOUNT}
        href={OWNER_NOTIFICATIONS_PATH}
      />
    </div>
  );
}
