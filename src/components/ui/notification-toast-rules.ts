// 화면 안내(#371) 규칙. 1분마다 받은 새 알림 중 무엇을 띄울지, 이미 본 알림을 얼마나 기억할지. 화면(notification-toast.tsx)이 쓴다.

import {
  type MyNotification,
  type NotificationAccount,
  PUSH_TOAST_MESSAGE,
} from '@/server/notifications/inbox-types';

/**
 * 이보다 오래된 알림은 화면 안내로 띄우지 않는다(서버 시각 기준). 화면을 다시 열었거나 다른 앱에 갔다 왔을 때
 * 지난 알림이 한꺼번에 뜨지 않게 한다. 띄우지 않은 알림도 알림함과 종에는 그대로 남는다
 */
export const TOAST_MAX_AGE_MS = 2 * 60_000;

/** 이미 본(띄웠거나 띄우지 않기로 한) 알림 id를 이만큼만 기억한다 */
export const TOAST_SEEN_LIMIT = 100;

/** 띄울 알림: 처음 보는 것, 안 읽은 것, 서버 시각 기준 TOAST_MAX_AGE_MS 안에 생긴 것. 최신 순 */
export function pickToastItems(
  items: readonly MyNotification[],
  seen: ReadonlySet<string>,
  serverNow: string,
): MyNotification[] {
  const now = Date.parse(serverNow);
  return items
    .filter(
      (item) =>
        !seen.has(item.id) &&
        item.readAt === null &&
        now - Date.parse(item.createdAt) <= TOAST_MAX_AGE_MS,
    )
    .sort(
      (a, b) =>
        Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
        (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
    );
}

/** 이번에 받은 알림 id를 기억 목록에 더한다. 같은 id는 한 번만, 오래된 것부터 버려서 TOAST_SEEN_LIMIT개까지 */
export function rememberSeen(seen: readonly string[], items: readonly MyNotification[]): string[] {
  const fresh = new Set(items.map((item) => item.id));
  return [...seen.filter((id) => !fresh.has(id)), ...fresh].slice(-TOAST_SEEN_LIMIT);
}

/** 기억해 둔 값(sessionStorage)을 읽는다. 모양이 틀리면 빈 목록 */
export function parseSeen(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string').slice(-TOAST_SEEN_LIMIT)
      : [];
  } catch {
    return [];
  }
}

/**
 * 서비스 워커가 보낸 메시지(public/sw.js, #371)에 이 화면 안내가 할 일.
 * ask: 이 계정의 푸시이고 지금 이 화면을 쓰고 있어서(보이고 포커스가 있음) 바로 묻고 답한다 /
 * decline: 다른 계정이거나 이 화면을 쓰고 있지 않아 띄우지 않는다고 답한다(서비스 워커가 기기 알림을 띄운다) / ignore: 푸시 메시지가 아니다
 */
export function pushToastAction(
  data: unknown,
  input: { account: NotificationAccount; watching: boolean },
): 'ask' | 'decline' | 'ignore' {
  if (typeof data !== 'object' || data === null) return 'ignore';
  const message = data as { type?: unknown; account?: unknown };
  if (message.type !== PUSH_TOAST_MESSAGE) return 'ignore';
  return message.account === input.account && input.watching ? 'ask' : 'decline';
}
