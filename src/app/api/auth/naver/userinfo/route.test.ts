// 네이버 로그인 사용자 정보 다리(W21). 받은 토큰을 네이버에만 넘기고 표준 모양으로 돌려주는지 본다. fetch는 가짜다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const call = (authorization?: string) =>
  GET(
    new Request('https://toori.example/api/auth/naver/userinfo', {
      headers: authorization ? { authorization } : {},
    }),
  );

describe('GET /api/auth/naver/userinfo', () => {
  it('받은 Bearer 토큰 그대로 네이버 프로필 API를 부르고 표준 모양으로 돌려준다', async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        resultcode: '00',
        message: 'success',
        response: { id: 'naver-1', email: 'a@naver.com', nickname: '별명' },
      }),
    );
    const res = await call('Bearer token-1');
    expect(fetchMock).toHaveBeenCalledWith('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: 'Bearer token-1' },
      cache: 'no-store',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sub: 'naver-1', email: 'a@naver.com', name: '별명' });
  });

  it('토큰이 없으면 네이버를 부르지 않고 401', async () => {
    expect((await call()).status).toBe(401);
    expect((await call('Basic abc')).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('네이버가 거절하거나 실패 결과를 주거나 연결이 안 되면 401', async () => {
    fetchMock.mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));
    expect((await call('Bearer bad')).status).toBe(401);
    fetchMock.mockResolvedValueOnce(Response.json({ resultcode: '024', message: 'fail' }));
    expect((await call('Bearer bad')).status).toBe(401);
    fetchMock.mockRejectedValueOnce(new Error('network'));
    expect((await call('Bearer bad')).status).toBe(401);
  });
});
