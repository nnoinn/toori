'use server';

// 고객 알림함 함수 4개의 가짜 결과 버전(#371). 이름·입력·결과는 #371에서 현동훈과 맞춘 모양 그대로다.
// 진짜 함수가 들어오면 화면(알림함·종)이 그 함수를 부르게 바꾸고 이 파일과 fake-store.ts를 지운다.
// 스위치(DEV_FAKE_NOTIFICATIONS)가 꺼져 있으면: 안 읽은 수는 null(종 숨김), 목록·읽음은 실패, 새 알림은 없음.
// 고객 모드로 로그인한 계정만 쓴다(X-102). 로그인 안 함·원장님 모드면 안 읽은 수는 null이고 나머지는 실패다.

import { z } from 'zod';

import { getRequestNow } from '@/lib/request-time';
import { fail, ok, type Result } from '@/lib/result';
import { requireCustomer } from '@/server/auth';

import {
  countUnread,
  fakeNotificationsMode,
  fakeStore,
  markRead,
  notificationsSince,
  pageNotifications,
} from './fake-store';
import { type MyNotification, NOTIFICATIONS_PAGE_SIZE } from './notification-rules';

const NOT_READY = fail('NOT_READY', '알림함은 아직 준비 중이에요');
const FAKE_FAILED = fail('FAKE_FAILED', '알림을 불러오지 못했어요. 잠시 후 다시 시도해 주세요');
const INVALID_INPUT = fail('INVALID_INPUT', '요청을 확인하지 못했어요. 다시 시도해 주세요');

const listInputSchema = z
  .object({
    cursor: z.string().min(1).max(200).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .optional();

const markInputSchema = z.union([
  z.object({ ids: z.array(z.string().min(1).max(100)).min(1).max(100) }),
  z.object({ all: z.literal(true) }),
]);

const sinceSchema = z.iso.datetime({ offset: true });

/** 스위치와 로그인을 확인한다. 쓸 수 있으면 null, 아니면 돌려줄 실패 */
async function checkAccess(): Promise<Result<never> | null> {
  const mode = fakeNotificationsMode();
  if (!mode) return NOT_READY;
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  return mode === 'error' ? FAKE_FAILED : null;
}

/** 알림함: 최근 90일, 최신 순, limit개씩(기본 20). 다음 장은 nextCursor로 */
export async function listMyNotifications(input?: {
  cursor?: string;
  limit?: number;
}): Promise<Result<{ items: MyNotification[]; nextCursor: string | null; serverNow: string }>> {
  const parsed = listInputSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const denied = await checkAccess();
  if (denied) return denied;
  const now = await getRequestNow();
  const items = fakeNotificationsMode() === 'empty' ? [] : fakeStore(now);
  const page = pageNotifications(items, {
    cursor: parsed.data?.cursor,
    limit: parsed.data?.limit ?? NOTIFICATIONS_PAGE_SIZE,
    now,
  });
  return ok({ ...page, serverNow: now.toISOString() });
}

/** 종의 안 읽은 수. 로그인 안 함·지금 계정이 고객이 아님·스위치 꺼짐이면 null(종을 숨긴다) */
export async function countMyUnreadNotifications(): Promise<Result<number | null>> {
  const mode = fakeNotificationsMode();
  if (!mode) return ok(null);
  const auth = await requireCustomer();
  if (!auth.ok) return ok(null);
  if (mode === 'error') return FAKE_FAILED;
  if (mode === 'empty') return ok(0);
  const now = await getRequestNow();
  return ok(countUnread(fakeStore(now), now));
}

/** 읽음으로. 줄을 누를 때 { ids: [id] }, [모두 읽음]은 { all: true }. 이미 읽은 것·없는 것은 건너뛴다 */
export async function markNotificationsRead(
  input: { ids: string[] } | { all: true },
): Promise<Result<{ count: number }>> {
  const parsed = markInputSchema.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const denied = await checkAccess();
  if (denied) return denied;
  if (fakeNotificationsMode() === 'empty') return ok({ count: 0 });
  const now = await getRequestNow();
  return ok({ count: markRead(fakeStore(now), parsed.data, now) });
}

/** 화면 안내용: since 뒤에 생긴 알림(오래된 순). since는 지난번 결과의 serverNow */
export async function listMyNotificationsSince(
  since: string,
): Promise<Result<{ items: MyNotification[]; serverNow: string }>> {
  const parsed = sinceSchema.safeParse(since);
  if (!parsed.success) return INVALID_INPUT;
  const denied = await checkAccess();
  if (denied) return denied;
  const now = await getRequestNow();
  const items = fakeNotificationsMode() === 'empty' ? [] : fakeStore(now);
  return ok({
    items: notificationsSince(items, new Date(parsed.data)),
    serverNow: now.toISOString(),
  });
}
