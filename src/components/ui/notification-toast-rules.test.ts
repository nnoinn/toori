// 화면 안내(#371) 규칙: 무엇을 띄우는지(처음 보는 것, 안 읽은 것, 2분 안), 이미 본 알림을 어떻게 기억하는지,
// 서비스 워커의 새 알림 메시지에 무엇을 하고 "띄웠다"고 언제 답하는지(11/22 손 점검: 열린 창 모두에 바로).

import { describe, expect, it } from 'vitest';

import { type MyNotification, PUSH_TOAST_MESSAGE } from '@/server/notifications/inbox-types';

import {
  parseSeen,
  pickToastItems,
  pushToastAction,
  pushToastId,
  rememberSeen,
  TOAST_MAX_AGE_MS,
  TOAST_SEEN_LIMIT,
  toastedPush,
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

describe('pushToastAction: 서비스 워커의 새 알림 메시지 (#371)', () => {
  const message = { type: PUSH_TOAST_MESSAGE, account: 'customer', id: 'n-1' };
  const watching = { account: 'customer' as const, visible: true, focused: true };

  it('이 계정의 알림이고 이 화면을 쓰고 있으면(보이고 포커스) 바로 묻고 띄웠는지 답한다(ask)', () => {
    expect(pushToastAction(message, watching)).toBe('ask');
  });

  it('화면은 보이지만 다른 앱·다른 창을 보는 중이면 바로 묻고 띄우되, 기기 알림도 뜨게 아니라고 답한다(show)', () => {
    expect(pushToastAction(message, { ...watching, focused: false })).toBe('show');
  });

  it('다른 계정의 알림이거나 화면이 보이지 않으면(다른 탭, 내린 창) 묻지 않고 아니라고 답한다(decline)', () => {
    expect(pushToastAction({ ...message, account: 'owner' }, watching)).toBe('decline');
    expect(pushToastAction(message, { ...watching, visible: false })).toBe('decline');
    expect(pushToastAction(message, { ...watching, visible: false, focused: false })).toBe(
      'decline',
    );
  });

  it('새 알림 메시지가 아니면 아무것도 하지 않는다(ignore)', () => {
    expect(pushToastAction({ ...message, type: 'other' }, watching)).toBe('ignore');
    expect(pushToastAction(null, watching)).toBe('ignore');
    expect(pushToastAction('toori:push-toast', watching)).toBe('ignore');
  });

  it('같이 온 알림 id를 읽는다. 없거나 모양이 틀리면(예전 푸시) null', () => {
    expect(pushToastId(message)).toBe('n-1');
    expect(pushToastId({ ...message, id: undefined })).toBeNull();
    expect(pushToastId({ ...message, id: '' })).toBeNull();
    expect(pushToastId({ ...message, id: 3 })).toBeNull();
    expect(pushToastId(null)).toBeNull();
  });
});

describe('toastedPush: 서비스 워커에 "띄웠다"고 답할지 (#371)', () => {
  it('그 알림을 이번에 띄웠거나 이 탭이 이미 띄웠으면 띄웠다고 답한다(기기 알림을 생략한다)', () => {
    expect(toastedPush('n-1', { fresh: [item('n-1', 1)], toasted: new Set() })).toBe(true);
    expect(toastedPush('n-1', { fresh: [], toasted: new Set(['n-1']) })).toBe(true);
  });

  it('그 알림을 띄우지 않았으면(알림함에 아직 없음, 읽음, 오래됨, 다른 알림만 띄움) 아니라고 답한다(기기 알림이 뜬다)', () => {
    expect(toastedPush('n-1', { fresh: [], toasted: new Set() })).toBe(false);
    expect(toastedPush('n-1', { fresh: [item('n-2', 1)], toasted: new Set(['n-3']) })).toBe(false);
  });

  it('알림 id를 모르면(예전 푸시) 이번에 띄운 알림이 있을 때만 띄웠다고 답한다', () => {
    expect(toastedPush(null, { fresh: [item('n-2', 1)], toasted: new Set() })).toBe(true);
    expect(toastedPush(null, { fresh: [], toasted: new Set(['n-1']) })).toBe(false);
  });
});
