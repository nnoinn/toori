// 고객 알림함(#371) 주소와 문구. 알림함 화면, PC 위쪽 메뉴·폰 홈 화면의 종, 고객 틀의 화면 안내가 같이 쓴다.
// 목록·종의 동작과 공통 문구·시각 문구는 공통 UI(notification-inbox.tsx, account-notification-bell.tsx,
// notification-inbox-rules.ts)다. 원장님 알림함(owner-notifications.ts)과 같은 부품을 쓴다(11/20 정찬형)

/** 고객 알림함 주소. 아래 메뉴에는 넣지 않고 종으로 들어온다(11/15 nnoinn) */
export const NOTIFICATIONS_PATH = '/notifications';

/** 고객 알림을 받는 계정 종류(알림함 함수에 넘긴다, NOTI-07) */
export const CUSTOMER_NOTIFICATION_ACCOUNT = 'customer' as const;

/** 알림이 없을 때 설명. 고객에게 가는 알림의 주요 종류다 */
export const CUSTOMER_NOTIFICATIONS_EMPTY_HELP = '예약 확정, 취소, 예약 시간 알림이 여기에 쌓여요.';
