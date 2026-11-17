// 알림함(#371) 모양과 정해진 값. 화면('use client')과 서버 함수(inbox.ts)가 같이 쓴다.
// 'use server' 파일은 함수만 내보낼 수 있어서 모양과 값은 여기에 둔다.

/**
 * 알림함을 보는 계정 종류. 고객 화면은 'customer'(기본), 원장님 화면은 'owner'를 넘긴다.
 * 지금 들어와 있는 계정 모드와 같을 때만 그 계정의 알림을 준다(X-102, NOTI-07)
 */
export const NOTIFICATION_ACCOUNTS = ['customer', 'owner'] as const;
export type NotificationAccount = (typeof NOTIFICATION_ACCOUNTS)[number];

/** 알림함 한 줄 */
export type MyNotification = {
  id: string;
  title: string;
  body: string;
  /** 누르면 열 주소. 화면은 투리 안 주소('/'로 시작)만 연다 */
  url: string;
  /** ISO */
  createdAt: string;
  /** 읽은 시각(ISO), 안 읽었으면 null */
  readAt: string | null;
};

/**
 * 알림함이 바뀌었을 때(읽음으로 바꿈, 새 알림이 옴) 알리는 브라우저 이벤트. 종이 듣고 안 읽은 수를 다시 묻는다.
 * 고객 알림함(#443)이 쓰던 이름 그대로다
 */
export const NOTIFICATIONS_CHANGED_EVENT = 'toori:notifications-read';

/**
 * 서비스 워커(public/sw.js)가 푸시를 받았을 때 앞에 보이는 창의 화면 안내에 보내는 메시지 이름(#371).
 * 메시지는 { type, account }이고, 그 계정의 화면 안내가 새 알림을 물은 뒤 함께 온 포트로 { shown }을 답한다.
 * sw.js의 같은 이름 값과 같아야 한다(sw.test.ts가 확인한다)
 */
export const PUSH_TOAST_MESSAGE = 'toori:push-toast';

/** 알림함에서 한 번에 불러오는 수(기본) */
export const NOTIFICATIONS_PAGE_SIZE = 20;

/** 알림 종을 누르면 상자에 보여 주는 최근 알림 수(11/16 nnoinn "5~6개") */
export const NOTIFICATIONS_BELL_COUNT = 5;

/** 알림함에서 한 번에 불러올 수 있는 가장 큰 수 */
export const NOTIFICATIONS_PAGE_MAX = 50;

/**
 * 화면 안내용 새 알림 확인(listMyNotificationsSince)은 since보다 이만큼 앞부터 돌려준다.
 * 서버와 DB의 시계 차이, 저장이 끝나기 전에 확인한 경우에도 새 알림을 놓치지 않으려는 것이라, 부르는 쪽은 id로 이미 띄운 알림을 거른다
 */
export const NOTIFICATIONS_SINCE_OVERLAP_SECONDS = 30;
