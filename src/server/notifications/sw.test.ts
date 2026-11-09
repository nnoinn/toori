// 서비스 워커의 푸시 받기 (public/sw.js, W16, #131). 지금 계정과 다른 계정의 표시, 누르면 가는 곳, 내용을 못 읽거나 계정을 묻지 못할 때를 본다.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

import { beforeEach, describe, expect, it } from 'vitest';

const SOURCE = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');

type Handler = (event: unknown) => void;
type Client = { focus: () => Promise<void>; navigate: (path: string) => Promise<void> };

const state = {
  mode: 'customer' as string | Error,
  shown: [] as { title: string; options: Record<string, unknown> }[],
  opened: [] as string[],
  navigated: [] as string[],
  clients: [] as Client[],
};

function load() {
  const handlers: Record<string, Handler> = {};
  const self = {
    addEventListener: (name: string, handler: Handler) => {
      handlers[name] = handler;
    },
    registration: {
      showNotification: async (title: string, options: Record<string, unknown>) => {
        state.shown.push({ title, options });
      },
    },
    clients: {
      matchAll: async () => state.clients,
      openWindow: async (path: string) => {
        state.opened.push(path);
      },
    },
  };
  const fetch = async () => {
    if (state.mode instanceof Error) throw state.mode;
    return { ok: true, json: async () => ({ mode: state.mode }) };
  };
  runInNewContext(SOURCE, { self, fetch, encodeURIComponent });
  return handlers;
}

/** 이벤트를 보내고 waitUntil에 넘긴 일이 끝나기를 기다린다 */
async function fire(handler: Handler, event: Record<string, unknown>) {
  let work: unknown;
  handler({ ...event, waitUntil: (promise: unknown) => (work = promise) });
  await work;
}

const push = (content: unknown) => ({ data: { json: () => content } });
const clickOn = (data: unknown) => ({ notification: { data, close: () => {} } });

const ORDER_ALERT = { title: '새 예약이 들어왔어요', body: '커트', url: '/owner/r/1' };

beforeEach(() => {
  state.mode = 'customer';
  state.shown = [];
  state.opened = [];
  state.navigated = [];
  state.clients = [];
});

describe('push', () => {
  it('지금 계정의 알림은 기본 아이콘과 원래 제목으로 보여준다', async () => {
    state.mode = 'owner';
    await fire(load().push, push({ ...ORDER_ALERT, account: 'owner' }));
    expect(state.shown[0].title).toBe('새 예약이 들어왔어요');
    expect(state.shown[0].options).toMatchObject({
      body: '커트',
      icon: '/brand/app-icon/toori-app-icon-light-192.png',
    });
  });

  it('다른 계정의 알림은 흑백 아이콘에 제목 앞 계정 이름을 붙인다', async () => {
    await fire(load().push, push({ ...ORDER_ALERT, account: 'owner' }));
    expect(state.shown[0].title).toBe('[원장님] 새 예약이 들어왔어요');
    expect(state.shown[0].options.icon).toBe('/brand/app-icon/toori-app-icon-gray-192.png');
  });

  it('지금 계정을 묻지 못하면 다른 계정의 알림처럼 보여준다', async () => {
    state.mode = new Error('offline');
    await fire(load().push, push({ title: '예약이 확정됐어요', url: '/r/1', account: 'customer' }));
    expect(state.shown[0].title).toBe('[고객] 예약이 확정됐어요');
  });

  it('내용을 읽지 못해도 알림을 보여준다(브라우저 규칙)', async () => {
    await fire(load().push, {
      data: {
        json: () => {
          throw new Error('not json');
        },
      },
    });
    expect(state.shown[0].title).toBe('새 알림이 있어요');
    await fire(load().push, {});
    expect(state.shown).toHaveLength(2);
  });
});

describe('notificationclick', () => {
  it('지금 계정의 알림은 그 화면을 새 창으로 연다', async () => {
    state.mode = 'owner';
    await fire(load().notificationclick, clickOn({ url: '/owner/r/1', account: 'owner' }));
    expect(state.opened).toEqual(['/owner/r/1']);
  });

  it('다른 계정의 알림은 로그인 화면을 거쳐 그 화면으로 간다', async () => {
    await fire(load().notificationclick, clickOn({ url: '/owner/r/1', account: 'owner' }));
    expect(state.opened).toEqual(['/login?mode=owner&next=%2Fowner%2Fr%2F1']);
  });

  it('열려 있는 창이 있으면 그 창에서 연다', async () => {
    state.clients = [
      {
        focus: async () => {},
        navigate: async (path) => {
          state.navigated.push(path);
        },
      },
    ];
    await fire(load().notificationclick, clickOn({ url: '/r/1', account: 'customer' }));
    expect(state.navigated).toEqual(['/r/1']);
    expect(state.opened).toEqual([]);
  });

  it('그 창으로 옮기지 못하면 새 창으로 연다', async () => {
    state.clients = [
      {
        focus: async () => {},
        navigate: async () => {
          throw new Error('not controlled');
        },
      },
    ];
    await fire(load().notificationclick, clickOn({ url: '/r/1', account: 'customer' }));
    expect(state.opened).toEqual(['/r/1']);
  });
});
