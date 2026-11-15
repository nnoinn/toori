import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildFakeNotifications,
  countUnread,
  encodeCursor,
  fakeNotificationsMode,
  markRead,
  notificationsSince,
  pageNotifications,
} from './fake-store';
import type { MyNotification } from './notification-rules';

// 알림함 가짜 결과 버전(#371). 진짜 함수와 맞춘 모양(최근 90일, 최신 순, 시각+id cursor, 읽음 건너뛰기)을 지키는지 본다
const now = new Date('2026-11-15T03:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function item(id: string, msAgo: number, read = false): MyNotification {
  const createdAt = new Date(now.getTime() - msAgo).toISOString();
  return { id, title: id, body: '', url: '/', createdAt, readAt: read ? createdAt : null };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('fakeNotificationsMode', () => {
  it('로컬 개발에서 DEV_FAKE_NOTIFICATIONS가 on·empty·error일 때만 켜진다', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_FAKE_NOTIFICATIONS', 'on');
    expect(fakeNotificationsMode()).toBe('on');
    vi.stubEnv('DEV_FAKE_NOTIFICATIONS', 'empty');
    expect(fakeNotificationsMode()).toBe('empty');
    vi.stubEnv('DEV_FAKE_NOTIFICATIONS', 'error');
    expect(fakeNotificationsMode()).toBe('error');
    vi.stubEnv('DEV_FAKE_NOTIFICATIONS', 'yes');
    expect(fakeNotificationsMode()).toBeNull();
  });

  it('배포(production)와 테스트에서는 스위치를 적어도 꺼져 있다', () => {
    vi.stubEnv('DEV_FAKE_NOTIFICATIONS', 'on');
    vi.stubEnv('NODE_ENV', 'production');
    expect(fakeNotificationsMode()).toBeNull();
    vi.stubEnv('NODE_ENV', 'test');
    expect(fakeNotificationsMode()).toBeNull();
  });
});

describe('buildFakeNotifications', () => {
  const items = buildFakeNotifications(now);

  it('25개를 최신 순으로 만들고, 모두 90일 안이고 투리 안 주소다', () => {
    expect(items).toHaveLength(25);
    const times = items.map((it) => Date.parse(it.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(Math.min(...times)).toBeGreaterThanOrEqual(now.getTime() - 90 * DAY_MS);
    for (const it of items) expect(it.url.startsWith('/')).toBe(true);
    expect(new Set(items.map((it) => it.id)).size).toBe(25);
  });

  it('맨 위 몇 개는 안 읽음이라 종에 수가 보인다', () => {
    expect(items[0]?.readAt).toBeNull();
    expect(countUnread(items, now)).toBeGreaterThan(0);
  });
});

describe('pageNotifications', () => {
  it('20개씩 주고, 다음 장은 nextCursor로 이어서 빠짐·겹침 없이 준다', () => {
    const items = buildFakeNotifications(now);
    const first = pageNotifications(items, { limit: 20, now });
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).not.toBeNull();
    const second = pageNotifications(items, { cursor: first.nextCursor ?? '', limit: 20, now });
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    expect([...first.items, ...second.items].map((it) => it.id)).toEqual(items.map((it) => it.id));
  });

  it('딱 limit개만 남으면 다음 장이 없다', () => {
    const items = [item('a', 1000), item('b', 2000)];
    expect(pageNotifications(items, { limit: 2, now }).nextCursor).toBeNull();
  });

  it('같은 시각에 생긴 알림도 장이 바뀔 때 빠지지 않는다(시각+id)', () => {
    const items = [item('c', 1000), item('b', 1000), item('a', 1000)];
    const first = pageNotifications(items, { limit: 2, now });
    expect(first.items.map((it) => it.id)).toEqual(['c', 'b']);
    const second = pageNotifications(items, { cursor: first.nextCursor ?? '', limit: 2, now });
    expect(second.items.map((it) => it.id)).toEqual(['a']);
  });

  it('90일이 지난 알림은 보여주지 않는다', () => {
    const items = [item('new', DAY_MS), item('edge', 90 * DAY_MS), item('old', 90 * DAY_MS + 1)];
    expect(pageNotifications(items, { limit: 20, now }).items.map((it) => it.id)).toEqual([
      'new',
      'edge',
    ]);
  });

  it('알아볼 수 없는 cursor는 빈 장이다', () => {
    const items = buildFakeNotifications(now);
    expect(pageNotifications(items, { cursor: 'nope', limit: 20, now })).toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('cursor는 시각과 id로 만든다', () => {
    expect(encodeCursor({ createdAt: '2026-11-15T03:00:00.000Z', id: 'fake-01' })).toBe(
      '2026-11-15T03:00:00.000Z_fake-01',
    );
  });
});

describe('markRead와 countUnread', () => {
  it('고른 알림만 읽음으로 바꾸고, 이미 읽은 것과 없는 id는 건너뛴다', () => {
    const items = [item('a', 1000), item('b', 2000, true), item('c', 3000)];
    expect(markRead(items, { ids: ['a', 'b', 'zzz'] }, now)).toBe(1);
    expect(items.map((it) => it.readAt !== null)).toEqual([true, true, false]);
    expect(countUnread(items, now)).toBe(1);
  });

  it('모두 읽음은 안 읽은 것만 세어 바꾼다', () => {
    const items = [item('a', 1000), item('b', 2000, true), item('c', 3000)];
    expect(markRead(items, { all: true }, now)).toBe(2);
    expect(countUnread(items, now)).toBe(0);
  });

  it('90일이 지난 안 읽은 알림은 수에 넣지 않는다', () => {
    expect(countUnread([item('old', 91 * DAY_MS)], now)).toBe(0);
  });
});

describe('notificationsSince', () => {
  it('since 뒤에 생긴 알림만 오래된 순으로 준다(화면 안내용)', () => {
    const items = [item('newest', 1000), item('mid', 60_000), item('old', 120_000)];
    const since = new Date(now.getTime() - 90_000);
    expect(notificationsSince(items, since).map((it) => it.id)).toEqual(['mid', 'newest']);
  });
});
