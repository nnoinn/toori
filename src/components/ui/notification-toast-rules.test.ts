// 화면 안내(#371) 규칙: 무엇을 띄우는지(처음 보는 것, 안 읽은 것, 2분 안), 이미 본 알림을 어떻게 기억하는지.

import { describe, expect, it } from 'vitest';

import type { MyNotification } from '@/server/notifications/inbox-types';

import {
  parseSeen,
  pickToastItems,
  rememberSeen,
  TOAST_MAX_AGE_MS,
  TOAST_SEEN_LIMIT,
} from './notification-toast-rules';

const SERVER_NOW = '2026-11-16T03:00:00.000Z';

function item(id: string, secondsAgo: number, readAt: string | null = null): MyNotification {
  return {
    id,
    title: `알림 ${id}`,
    body: '내용',
    url: '/reservations',
    createdAt: new Date(Date.parse(SERVER_NOW) - secondsAgo * 1000).toISOString(),
    readAt,
  };
}

describe('화면 안내 규칙', () => {
  it('처음 보는 안 읽은 알림 중 서버 시각 기준 2분 안에 생긴 것만 최신 순으로 띄운다', () => {
    const items = [
      item('a', 10),
      item('b', 5),
      item('seen', 3),
      item('read', 2, SERVER_NOW),
      item('old', TOAST_MAX_AGE_MS / 1000 + 1),
      item('edge', TOAST_MAX_AGE_MS / 1000),
    ];
    expect(pickToastItems(items, new Set(['seen']), SERVER_NOW).map((it) => it.id)).toEqual([
      'b',
      'a',
      'edge',
    ]);
  });

  it('같은 시각이면 id 큰 것이 먼저다', () => {
    expect(
      pickToastItems([item('x1', 5), item('x2', 5)], new Set(), SERVER_NOW).map((it) => it.id),
    ).toEqual(['x2', 'x1']);
  });

  it('받은 알림은 띄우지 않은 것도 기억해서 다음 확인 때 다시 띄우지 않는다. 오래된 기억부터 버린다', () => {
    const seen = rememberSeen(['a', 'b'], [item('b', 1), item('c', 1)]);
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(pickToastItems([item('c', 1)], new Set(seen), SERVER_NOW)).toEqual([]);

    const many = Array.from({ length: TOAST_SEEN_LIMIT }, (_, i) => `id-${i}`);
    const trimmed = rememberSeen(many, [item('new', 1)]);
    expect(trimmed).toHaveLength(TOAST_SEEN_LIMIT);
    expect(trimmed[0]).toBe('id-1');
    expect(trimmed.at(-1)).toBe('new');
  });

  it('기억해 둔 값이 없거나 모양이 틀리면 빈 목록이다', () => {
    expect(parseSeen(null)).toEqual([]);
    expect(parseSeen('나쁜 값')).toEqual([]);
    expect(parseSeen('{"a":1}')).toEqual([]);
    expect(parseSeen('["a", 2, "b"]')).toEqual(['a', 'b']);
  });
});
