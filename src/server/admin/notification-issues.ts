'use server';

// 운영자 화면 위 알림 종(#373 ⑤, 11/16 nnoinn: 왼쪽 메뉴 대신 고객처럼 오른쪽 위 종). 운영자만(requireAdmin).
// 종 숫자는 보내지 못한 알림 수이고, 종을 누르면 상자에 최근 알림 5개(보내지 못함·기기 없음)가 뜬다.
// 상자에는 알림 제목·종류·시각만 보여 주고 받는 사람은 보여 주지 않는다(받는 사람은 알림 확인 화면에서, 열람 기록과 함께).

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { ok, type Result } from '@/lib/result';
import { requireAdmin } from '@/server/auth';
import { NOTIFICATIONS_BELL_COUNT } from '@/server/notifications/inbox-types';

import {
  countNotificationIssues,
  type RecentNotificationIssue,
  selectRecentNotificationIssues,
} from './notification-issues-store';

/** 종 숫자(보내지 못함 수)와 상자에 보여 줄 최근 알림. 운영자가 아니면 그 실패 */
export async function getNotificationIssueBell(): Promise<
  Result<{ failedCount: number; items: RecentNotificationIssue[] }>
> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const db = getDb();
  const now = await getRequestNow();
  const [counts, items] = await Promise.all([
    countNotificationIssues(db, now),
    selectRecentNotificationIssues(db, { now, limit: NOTIFICATIONS_BELL_COUNT }),
  ]);
  return ok({ failedCount: counts.failed, items });
}
