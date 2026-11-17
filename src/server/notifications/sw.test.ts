// 서비스 워커의 푸시 받기 (public/sw.js, W16, #131). 지금 계정과 다른 계정의 표시, 누르면 가는 곳, 내용을 못 읽거나 계정을 묻지 못할 때,
// 앞에 보이는 창의 화면 안내에 먼저 전하고 크롬 계열이면 기기 알림을 생략하는지(#371)를 본다.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PUSH_TOAST_MESSAGE } from './inbox-types';

const SOURCE = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');

type Handler = (event: unknown) => void;
type Client = {
  focus: () => Promise<void>;
  navigate: (path: string) => Promise<void>;
  visibilityState?: 'visible' | 'hidden';
  focused?: boolean;
  postMessage?: (message: unknown, ports: FakePort[]) => void;
};
type FakePort = { postMessage: (data: unknown) => void };

const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.0.0 Mobile/15E148 Safari/604.1';

/** 포트로 보낸 답이 다음 차례에 반대쪽 onmessage로 간다(브라우저처럼 늦게) */
class FakeChannel {
  port1: { onmessage: ((event: { data: unknown }) => void) | null; close: () => void } = {
    onmessage: null,
    close: () => {},
  };
  port2: FakePort = {
    postMessage: (data) => queueMicrotask(() => this.port1.onmessage?.({ data })),
  };
}

const state = {
  mode: 'customer' as string | Error,
  shown: [] as { title: string; options: Record<string, unknown> }[],
  opened: [] as string[],
  navigated: [] as string[],
  clients: [] as Client[],
  userAgent: CHROME,
  asked: [] as unknown[],
};

/** 지금 쓰고 있는 투리 창(보이고 포커스). answer가 있으면 화면 안내처럼 { shown: answer }로 답하고, 없으면 답하지 않는다 */
function visibleWindow(answer?: boolean): Client {
  return {
    focus: async () => {},
    navigate: async () => {},
    visibilityState: 'visible',
    focused: true,
    postMessage: (message, ports) => {
      state.asked.push(message);
      if (answer !== undefined) ports[0].postMessage({ shown: answer });
    },
  };
}

function load() {
  const handlers: Record<string, Handler> = {};
  const self = {
    navigator: { userAgent: state.userAgent },
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
  runInNewContext(SOURCE, {
    self,
    fetch,
    encodeURIComponent,
    MessageChannel: FakeChannel,
    setTimeout,
    clearTimeout,
  });
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
  state.userAgent = CHROME;
  state.asked = [];
});

afterEach(() => {
  vi.useRealTimers();
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

describe('push: 화면 안내와 겹치지 않게 (#371)', () => {
  const ALERT = { ...ORDER_ALERT, account: 'customer' };

  it('크롬 계열은 앞에 보이는 창의 화면 안내가 띄웠다고 답하면 기기 알림을 띄우지 않는다', async () => {
    state.clients = [visibleWindow(true)];
    await fire(load().push, push(ALERT));
    expect(state.asked).toEqual([{ type: PUSH_TOAST_MESSAGE, account: 'customer' }]);
    expect(state.shown).toEqual([]);
  });

  it('사파리와 아이폰의 다른 브라우저는 화면 안내가 띄워도 기기 알림을 띄운다(푸시마다 띄워야 한다)', async () => {
    for (const agent of [SAFARI, IPHONE_CHROME]) {
      state.userAgent = agent;
      state.clients = [visibleWindow(true)];
      await fire(load().push, push(ALERT));
    }
    expect(state.asked).toHaveLength(2);
    expect(state.shown.map((shown) => shown.title)).toEqual([ALERT.title, ALERT.title]);
  });

  it('화면 안내가 아니라고 답하면(그 계정의 화면 안내가 없는 창) 기기 알림을 띄운다. 여러 창 중 하나라도 띄웠으면 생략한다', async () => {
    state.clients = [visibleWindow(false)];
    await fire(load().push, push(ALERT));
    expect(state.shown).toHaveLength(1);
    state.clients = [visibleWindow(false), visibleWindow(true)];
    await fire(load().push, push(ALERT));
    expect(state.shown).toHaveLength(1);
  });

  it('답이 없으면 3초 기다린 뒤 기기 알림을 띄운다', async () => {
    vi.useFakeTimers();
    state.clients = [visibleWindow()];
    const work = fire(load().push, push(ALERT));
    await vi.advanceTimersByTimeAsync(2_999);
    expect(state.shown).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await work;
    expect(state.shown).toHaveLength(1);
  });

  it('다른 앱을 보는 중이면(창은 보이지만 포커스가 없음) 묻지 않고 기기 알림을 띄운다', async () => {
    state.clients = [{ ...visibleWindow(true), focused: false }];
    await fire(load().push, push(ALERT));
    expect(state.asked).toEqual([]);
    expect(state.shown).toHaveLength(1);
  });

  it('앞에 보이는 창이 없거나, 다른 계정의 알림이거나, 계정이 없는 알림이면 묻지 않고 띄운다', async () => {
    state.clients = [{ ...visibleWindow(true), visibilityState: 'hidden' }];
    await fire(load().push, push(ALERT));
    state.clients = [visibleWindow(true)];
    await fire(load().push, push({ ...ORDER_ALERT, account: 'owner' }));
    await fire(load().push, push(ORDER_ALERT));
    expect(state.asked).toEqual([]);
    expect(state.shown.map((shown) => shown.title)).toEqual([
      ORDER_ALERT.title,
      `[원장님] ${ORDER_ALERT.title}`,
      ORDER_ALERT.title,
    ]);
  });

  it('메시지 이름은 화면 안내(notification-toast.tsx)가 듣는 이름과 같다', () => {
    expect(SOURCE).toContain(`const PUSH_TOAST_MESSAGE = '${PUSH_TOAST_MESSAGE}';`);
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
