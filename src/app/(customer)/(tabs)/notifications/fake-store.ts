// 고객 알림함 가짜 결과 버전(#371, 11/15 현동훈 요청). 진짜 서버 함수(현동훈)가 들어오기 전에 화면을 만들고 확인하려고 쓴다.
// 로컬 개발(NODE_ENV=development)에서 .env.local에 DEV_FAKE_NOTIFICATIONS를 적었을 때만 켜진다. 배포 주소와 테스트에서는 꺼져 있다.
//   on: 가짜 알림 25개(맨 위 몇 개는 안 읽음)   empty: 빈 알림함   error: 모든 함수가 실패
// 꺼져 있으면 종은 숨고(안 읽은 수가 null) 알림함 주소는 404다. 그래서 main에 머지돼도 운영 주소에는 보이지 않는다.
// 가짜 알림은 개발 서버 메모리에 한 벌만 있다(로그인한 고객 모두 같은 알림). 서버를 다시 켜면 읽음 상태가 처음으로 돌아간다.
// 진짜 함수가 들어오면 이 파일과 fake-actions.ts를 지우고 화면이 진짜 함수를 부르게 바꾼다.

import 'server-only';

import { formatWon } from '@/lib/format';
import { SITE_NAME } from '@/lib/site';
import { addMinutes, formatKst, formatKstTime } from '@/lib/time';
import { NOTIFICATION_INBOX_DAYS, OWNER_FAULT_COUPON_AMOUNT } from '@/server/policy';

import type { MyNotification } from './notification-rules';

export type FakeNotificationsMode = 'on' | 'empty' | 'error';

/** 가짜 결과 스위치. 로컬 개발에서 DEV_FAKE_NOTIFICATIONS가 on·empty·error일 때만 값이 있다 */
export function fakeNotificationsMode(): FakeNotificationsMode | null {
  if (process.env.NODE_ENV !== 'development') return null;
  const value = process.env.DEV_FAKE_NOTIFICATIONS;
  return value === 'on' || value === 'empty' || value === 'error' ? value : null;
}

const HOUR_MINUTES = 60;
const DAY_MINUTES = 24 * HOUR_MINUTES;

const SHOPS = [
  '샘플 헤어 안산역',
  '샘플 네일 중앙역점',
  '샘플 래쉬 고잔',
  '샘플 헤어 월피',
  '샘플 네일 호수공원',
] as const;

type Kind =
  | 'confirmed'
  | 'reminder2h'
  | 'reminder15m'
  | 'agreedCancel'
  | 'ownerCancel'
  | 'cancelled'
  | 'noShow'
  | 'paymentCancelled'
  | 'digest';

/** 진짜 알림 문구(src/server/notifications)를 흉내 낸다. 예약 알림은 예약 상세 대신 내 예약 목록으로 간다(가짜 예약이라서) */
function fakeContent(kind: Kind, shop: string, createdAt: Date) {
  // 예약 시작 시각. 리마인드는 알림 시각에서 딱 2시간·15분 뒤, 나머지는 정각으로 맞춘다
  const startAt = (minutes: number, onTheHour = true) => {
    const start = addMinutes(createdAt, minutes);
    if (onTheHour) start.setUTCMinutes(0, 0, 0);
    return start;
  };
  switch (kind) {
    case 'confirmed':
      return {
        title: '예약이 확정됐어요',
        body: `${shop} · ${formatKst(startAt(DAY_MINUTES + 120))}`,
        url: '/reservations',
      };
    case 'reminder2h':
      return {
        title: '예약 2시간 전이에요',
        body: `${shop} · ${formatKst(startAt(2 * HOUR_MINUTES, false))}`,
        url: '/reservations',
      };
    case 'reminder15m':
      return {
        title: '예약 15분 전이에요',
        body: `${shop} · ${formatKstTime(startAt(15, false))} 시작`,
        url: '/reservations',
      };
    case 'agreedCancel':
      return {
        title: '원장님이 합의 후 취소를 요청했어요',
        body: `${shop} · ${formatKst(startAt(5 * HOUR_MINUTES))}`,
        url: '/reservations',
      };
    case 'ownerCancel':
      return {
        title: '원장님 사정으로 예약이 취소됐어요',
        body: `결제한 금액을 모두 돌려드리고 ${formatWon(OWNER_FAULT_COUPON_AMOUNT)} 쿠폰을 드렸어요`,
        url: '/reservations?tab=cancelled',
      };
    case 'cancelled':
      return {
        title: '예약이 취소됐어요',
        body: '환불 내용은 예약 상세에서 확인해 주세요',
        url: '/reservations?tab=cancelled',
      };
    case 'noShow':
      return {
        title: '노쇼로 처리됐어요',
        body: '잘못 처리됐으면 문의해 주세요',
        url: '/reservations?tab=completed',
      };
    case 'paymentCancelled':
      return {
        title: '결제가 취소됐어요',
        body: '결제가 취소되고 전액 환불돼요',
        url: '/reservations',
      };
    case 'digest':
      return {
        title: `(광고) ${SITE_NAME} · 상록구에 새 매물 3개가 올라왔어요`,
        body: '최대 30% 할인. 알림 끄기: 내 정보 > 알림 설정',
        url: '/home/list',
      };
  }
}

/** [몇 분 전, 종류, 안 읽음]. 최신 순 25개라 알림함 첫 장(20개) 뒤에 [더 보기]로 5개가 더 나온다 */
const SAMPLES: readonly (readonly [number, Kind, boolean])[] = [
  [3, 'reminder15m', true],
  [42, 'agreedCancel', true],
  [135, 'reminder2h', true],
  [320, 'confirmed', true],
  [DAY_MINUTES + 300, 'digest', false],
  [DAY_MINUTES + 600, 'ownerCancel', true],
  [2 * DAY_MINUTES + 60, 'confirmed', false],
  [3 * DAY_MINUTES, 'cancelled', false],
  [4 * DAY_MINUTES + 300, 'digest', false],
  [6 * DAY_MINUTES, 'noShow', false],
  [8 * DAY_MINUTES, 'confirmed', false],
  [10 * DAY_MINUTES, 'paymentCancelled', false],
  [13 * DAY_MINUTES, 'digest', false],
  [16 * DAY_MINUTES, 'confirmed', false],
  [20 * DAY_MINUTES, 'reminder2h', false],
  [24 * DAY_MINUTES, 'cancelled', false],
  [29 * DAY_MINUTES, 'digest', false],
  [35 * DAY_MINUTES, 'confirmed', false],
  [41 * DAY_MINUTES, 'reminder15m', false],
  [48 * DAY_MINUTES, 'digest', false],
  [55 * DAY_MINUTES, 'confirmed', false],
  [62 * DAY_MINUTES, 'cancelled', false],
  [70 * DAY_MINUTES, 'digest', false],
  [78 * DAY_MINUTES, 'confirmed', false],
  [86 * DAY_MINUTES, 'reminder2h', false],
];

/** 가짜 알림 25개를 now 기준으로 만든다. 최신 순 */
export function buildFakeNotifications(now: Date): MyNotification[] {
  return SAMPLES.map(([minutesAgo, kind, unread], index) => {
    const createdAt = addMinutes(now, -minutesAgo);
    return {
      id: `fake-${String(index + 1).padStart(2, '0')}`,
      ...fakeContent(kind, SHOPS[index % SHOPS.length], createdAt),
      createdAt: createdAt.toISOString(),
      readAt: unread ? null : addMinutes(createdAt, 10).toISOString(),
    };
  });
}

/** cursor는 마지막으로 받은 알림의 시각+id다. 같은 시각의 알림이 빠지지 않게 id까지 본다(#371 맞춘 모양) */
export function encodeCursor(item: Pick<MyNotification, 'createdAt' | 'id'>): string {
  return `${item.createdAt}_${item.id}`;
}

function decodeCursor(cursor: string): { time: number; id: string } | null {
  const at = cursor.indexOf('_');
  if (at <= 0) return null;
  const time = Date.parse(cursor.slice(0, at));
  const id = cursor.slice(at + 1);
  return Number.isNaN(time) || id === '' ? null : { time, id };
}

/** 최신 순(시각, 같으면 id 큰 것 먼저) */
function newestFirst(a: MyNotification, b: MyNotification): number {
  const diff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (diff !== 0) return diff;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * 알림함 한 장: 최근 NOTIFICATION_INBOX_DAYS일, 최신 순, cursor 다음부터 limit개. 더 있으면 nextCursor.
 * 알아볼 수 없는 cursor면 빈 장이다
 */
export function pageNotifications(
  items: readonly MyNotification[],
  { cursor, limit, now }: { cursor?: string; limit: number; now: Date },
): { items: MyNotification[]; nextCursor: string | null } {
  const from = now.getTime() - NOTIFICATION_INBOX_DAYS * DAY_MINUTES * 60_000;
  const after = cursor === undefined ? null : decodeCursor(cursor);
  if (cursor !== undefined && !after) return { items: [], nextCursor: null };
  const rest = items
    .filter((item) => Date.parse(item.createdAt) >= from)
    .filter((item) => {
      if (!after) return true;
      const time = Date.parse(item.createdAt);
      return time < after.time || (time === after.time && item.id < after.id);
    })
    .sort(newestFirst);
  const page = rest.slice(0, limit);
  const last = page.at(-1);
  return { items: page, nextCursor: rest.length > limit && last ? encodeCursor(last) : null };
}

/** 안 읽은 수(최근 NOTIFICATION_INBOX_DAYS일) */
export function countUnread(items: readonly MyNotification[], now: Date): number {
  return pageNotifications(items, { limit: items.length, now }).items.filter(
    (item) => item.readAt === null,
  ).length;
}

/** 읽음으로 바꾼다(items를 고친다). 이미 읽은 것과 없는 id는 건너뛰고, 바꾼 수를 돌려준다 */
export function markRead(
  items: MyNotification[],
  target: { ids: readonly string[] } | { all: true },
  now: Date,
): number {
  const ids = 'ids' in target ? new Set(target.ids) : null;
  let count = 0;
  for (const item of items) {
    if (item.readAt !== null) continue;
    if (ids && !ids.has(item.id)) continue;
    item.readAt = now.toISOString();
    count += 1;
  }
  return count;
}

/** since 뒤에 생긴 알림(오래된 순). 화면 안내용 */
export function notificationsSince(
  items: readonly MyNotification[],
  since: Date,
): MyNotification[] {
  return items
    .filter((item) => Date.parse(item.createdAt) > since.getTime())
    .sort((a, b) => newestFirst(b, a));
}

// 개발 서버 메모리의 가짜 알림 한 벌. 처음 부를 때 그때 시각 기준으로 만든다(시각이 고정돼야 cursor가 맞는다)
let store: MyNotification[] | null = null;

export function fakeStore(now: Date): MyNotification[] {
  store ??= buildFakeNotifications(now);
  return store;
}
