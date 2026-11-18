// 원장님 알림함(#371) 주소와 문구. 알림함 화면, 위 오른쪽 종, 원장님 틀의 화면 안내가 같이 쓴다.
// 목록·종의 동작과 공통 문구는 공통 UI(notification-inbox.tsx, account-notification-bell.tsx)다.

/** 원장님 알림함 주소. 왼쪽 메뉴에는 넣지 않고 위 오른쪽 종으로 들어온다(고객과 같음) */
export const OWNER_NOTIFICATIONS_PATH = '/owner/notifications';

/** 원장님 알림을 받는 계정 종류(알림함 함수에 넘긴다, NOTI-07) */
export const OWNER_NOTIFICATION_ACCOUNT = 'owner' as const;

/** 알림이 없을 때 설명. 원장님에게 가는 알림(alerts.ts)의 주요 종류다 */
export const OWNER_NOTIFICATIONS_EMPTY_HELP =
  '새 예약, 예약 취소, 입점 심사, 정산 계좌 알림이 여기에 쌓여요.';
