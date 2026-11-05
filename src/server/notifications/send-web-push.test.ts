// 웹 푸시 한 건 보내기 (W16). web-push 패키지는 가짜로 바꾼다. 보내는 값, 끝난 구독, 실패, 로그를 본다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ calls: [] as unknown[][], error: null as unknown }));

vi.mock('web-push', () => {
  class WebPushError extends Error {
    constructor(
      public statusCode: number,
      public endpoint: string,
    ) {
      super('Received unexpected response code');
    }
  }
  return {
    default: {
      WebPushError,
      sendNotification: async (...args: unknown[]) => {
        state.calls.push(args);
        if (state.error) throw state.error;
        return { statusCode: 201 };
      },
    },
  };
});

const { default: webpush } = await import('web-push');
const { sendWebPush } = await import('./send-web-push');

const ENDPOINT = 'https://push.example/secret-endpoint';
const TARGET = { endpoint: ENDPOINT, p256dh: 'p', auth: 'a' };
const pushError = (status: number) =>
  new (webpush.WebPushError as unknown as new (s: number, e: string) => Error)(status, ENDPOINT);

beforeEach(() => {
  state.calls = [];
  state.error = null;
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public-key');
  vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('sendWebPush', () => {
  it('구독 키와 VAPID 값으로 보낸다. 연락처는 개인 메일이 아니라 서비스 주소다', async () => {
    expect(await sendWebPush(TARGET, '{"title":"t"}')).toBe('sent');
    const [subscription, payload, options] = state.calls[0];
    expect(subscription).toEqual({ endpoint: ENDPOINT, keys: { p256dh: 'p', auth: 'a' } });
    expect(payload).toBe('{"title":"t"}');
    expect(options).toMatchObject({
      vapidDetails: {
        subject: 'https://toori.kr',
        publicKey: 'public-key',
        privateKey: 'private-key',
      },
      urgency: 'high',
    });
  });

  it.each([404, 410])('푸시 서버가 %i로 답하면 구독이 끝난 것이다', async (status) => {
    state.error = pushError(status);
    expect(await sendWebPush(TARGET, '{}')).toBe('expired');
    expect(console.error).not.toHaveBeenCalled();
  });

  it('다른 응답이면 실패이고 로그에 구독 주소를 남기지 않는다', async () => {
    state.error = pushError(500);
    expect(await sendWebPush(TARGET, '{}')).toBe('failed');
    expect(console.error).toHaveBeenCalledWith('[notify] 웹 푸시 실패:', 500);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('secret-endpoint');
  });

  it('연결 오류면 실패이고 오류 이름만 남긴다', async () => {
    state.error = new TypeError(`fetch ${ENDPOINT}`);
    expect(await sendWebPush(TARGET, '{}')).toBe('failed');
    expect(console.error).toHaveBeenCalledWith('[notify] 웹 푸시 실패:', 'TypeError');
  });

  it('키가 없으면 보내지 않는다', async () => {
    vi.stubEnv('VAPID_PRIVATE_KEY', '');
    expect(await sendWebPush(TARGET, '{}')).toBe('failed');
    expect(state.calls).toEqual([]);
  });
});
