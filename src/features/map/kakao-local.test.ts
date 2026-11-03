import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { fetchKakaoLocal } from './kakao-local';

// 카카오를 부르지 않고 fetch를 바꿔서 돈다

const fetchMock = vi.fn<typeof fetch>();

function respondWith(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

const request = {
  name: '좌표→행정구역',
  path: 'geo/coord2regioncode.json',
  params: { x: '126.83', y: '37.31' },
  schema: z.object({ documents: z.array(z.object({ code: z.string() })) }),
};

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('KAKAO_REST_API_KEY', 'test-key');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('fetchKakaoLocal', () => {
  it('카카오 로컬 주소에 값과 REST 키를 보내고 시간 제한을 건다', async () => {
    respondWith({ documents: [{ code: '4127310100' }] });
    expect(await fetchKakaoLocal(request)).toEqual({ documents: [{ code: '4127310100' }] });
    const [url, init] = fetchMock.mock.calls[0];
    const sent = new URL(url as URL);
    expect(`${sent.origin}${sent.pathname}`).toBe(
      'https://dapi.kakao.com/v2/local/geo/coord2regioncode.json',
    );
    expect(Object.fromEntries(sent.searchParams)).toEqual({ x: '126.83', y: '37.31' });
    expect(init?.headers).toEqual({ Authorization: 'KakaoAK test-key' });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('REST 키가 없으면 카카오를 부르지 않고 null', async () => {
    vi.stubEnv('KAKAO_REST_API_KEY', '');
    expect(await fetchKakaoLocal(request)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledOnce();
  });

  it('오류 상태(401, 500)면 null', async () => {
    for (const status of [401, 500]) {
      respondWith({ errorType: 'Error', message: 'error' }, status);
      expect(await fetchKakaoLocal(request)).toBeNull();
    }
    expect(console.error).toHaveBeenCalledTimes(2);
  });

  it('시간 초과나 네트워크 오류면 null이고, 기록에 보낸 좌표를 남기지 않는다', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'));
    expect(await fetchKakaoLocal(request)).toBeNull();
    const logged = vi.mocked(console.error).mock.calls.flat().join(' ');
    expect(logged).toContain('TimeoutError');
    expect(logged).not.toContain('126.83');
  });

  it('응답 모양이 다르면 null', async () => {
    respondWith({ meta: {} });
    expect(await fetchKakaoLocal(request)).toBeNull();
  });
});
