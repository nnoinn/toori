// 알림함(#371) 공통 규칙과 문구. 알림함 목록(notification-inbox.tsx)과 계정 알림 종(account-notification-bell.tsx)이 쓴다.
// 원장님 화면(11/17 정민석)과 고객 알림함(src/app/(customer)/(tabs)/notifications/, 11/20 정찬형)이 같이 쓴다.
// 알림 모양(MyNotification)은 알림함 함수(@/server/notifications/inbox)의 모양 그대로다.

import { safeNextPath } from '@/lib/safe-next';
import { kstDateKey, startOfKstDay, utcToKst } from '@/lib/time';
import { NOTIFICATION_INBOX_DAYS } from '@/server/policy';

export const NOTIFICATION_INBOX_TEXTS = {
  TITLE: '알림',
  MARK_ALL: '모두 읽음',
  MARKING_ALL: '읽음으로 바꾸는 중…',
  MORE: '더 보기',
  LOADING: '불러오는 중…',
  EMPTY: `최근 ${NOTIFICATION_INBOX_DAYS}일 동안 받은 알림이 없어요`,
  LOAD_FAILED: '알림을 불러오지 못했어요',
  MORE_FAILED: '더 불러오지 못했어요. 다시 눌러 주세요.',
  MARK_ALL_FAILED: '읽음으로 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.',
  RETRY: '다시 시도',
  UNREAD: '안 읽음',
} as const;

/** 알림을 누르면 갈 주소. 투리 안 주소가 아니면 null(이동하지 않고 읽음으로만 바꾼다) */
export function notificationHref(url: string): string | null {
  const path = safeNextPath(url, '');
  return path === '' ? null : path;
}

/**
 * 알림이 온 시각 문구. 서버 시각(serverNow) 기준이다.
 * 1분 안: "방금", 1시간 안: "N분 전", 24시간 안: "N시간 전", 그보다 전인데 한국 날짜로 어제면 "어제",
 * 그 밖에는 "11월 2일"(올해) 또는 "2025년 11월 2일"(지난해)
 */
export function notificationTimeText(createdAt: string, serverNow: string): string {
  const created = new Date(createdAt);
  const now = new Date(serverNow);
  const minutes = Math.floor((now.getTime() - created.getTime()) / 60_000);
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}시간 전`;
  const yesterday = new Date(startOfKstDay(now).getTime() - 1);
  if (kstDateKey(created) === kstDateKey(yesterday)) return '어제';
  const c = utcToKst(created);
  if (c.year === utcToKst(now).year) return `${c.month}월 ${c.day}일`;
  return `${c.year}년 ${c.month}월 ${c.day}일`;
}
