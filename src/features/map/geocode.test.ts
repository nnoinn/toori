import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ansan from './__fixtures__/kakao-address-ansan.json';
import empty from './__fixtures__/kakao-address-empty.json';
import oryu from './__fixtures__/kakao-address-oryu.json';
import regionOnly from './__fixtures__/kakao-address-region-only.json';
import sejong from './__fixtures__/kakao-address-sejong.json';
import { GEOCODE_ERRORS, geocodeAddress } from './geocode';

// __fixtures__의 JSON은 카카오 주소 검색(analyze_type=exact)을 실제로 불러 저장한 응답이다(10/24).
// 테스트는 카카오를 부르지 않고 fetch를 이 응답으로 바꿔서 돈다.

const fetchMock = vi.fn<typeof fetch>();

function respondWith(body: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

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

describe('geocodeAddress', () => {
  it('도로명 주소를 좌표와 시·도, 시·군·구 이름·코드로 바꾼다', async () => {
    respondWith(ansan);
    const result = await geocodeAddress('경기 안산시 상록구 한양대학로 55');
    expect(result).toEqual({
      ok: true,
      data: {
        roadAddress: '경기 안산시 상록구 한양대학로 55',
        jibunAddress: '경기 안산시 상록구 사동 1271',
        lat: 37.2980046949606,
        lng: 126.834494326011,
        region: { sido: '경기', sigungu: '안산시 상록구', sigunguCode: '41271' },
      },
    });
  });

  it('카카오에 앞뒤 공백을 지운 주소와 REST 키를 보낸다', async () => {
    respondWith(ansan);
    await geocodeAddress('  경기 안산시 상록구 한양대학로 55 ');
    const [url, init] = fetchMock.mock.calls[0];
    const sent = new URL(url as URL);
    expect(sent.searchParams.get('query')).toBe('경기 안산시 상록구 한양대학로 55');
    expect(sent.searchParams.get('analyze_type')).toBe('exact');
    expect(init?.headers).toEqual({ Authorization: 'KakaoAK test-key' });
  });

  it("주소에 '오류'가 들어 있어도(구로구 오류동) 정상 결과를 돌려준다", async () => {
    respondWith(oryu);
    const result = await geocodeAddress('서울 구로구 경인로 20');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.jibunAddress).toBe('서울 구로구 오류동 108-1');
    expect(result.data.region).toEqual({ sido: '서울', sigungu: '구로구', sigunguCode: '11530' });
  });

  it('시·군·구가 없는 세종시는 시·군·구 이름에 시·도 이름을 넣는다', async () => {
    respondWith(sejong);
    const result = await geocodeAddress('세종특별자치시 한누리대로 2130');
    expect(result.ok && result.data.region).toEqual({
      sido: '세종특별자치시',
      sigungu: '세종특별자치시',
      sigunguCode: '36110',
    });
  });

  it('결과가 없으면 ADDRESS_NOT_FOUND', async () => {
    respondWith(empty);
    const result = await geocodeAddress('경기 안산시 상록구 없는길 9999');
    expect(result).toEqual({
      ok: false,
      error: { code: 'ADDRESS_NOT_FOUND', message: GEOCODE_ERRORS.ADDRESS_NOT_FOUND },
    });
  });

  it('도로명 주소가 없는 결과(지역 이름만 맞음)만 있으면 ADDRESS_NOT_FOUND', async () => {
    respondWith(regionOnly);
    const result = await geocodeAddress('경기 안산시 상록구');
    expect(!result.ok && result.error.code).toBe('ADDRESS_NOT_FOUND');
  });

  it('빈 주소는 카카오를 부르지 않고 ADDRESS_NOT_FOUND', async () => {
    for (const address of ['', '   ']) {
      const result = await geocodeAddress(address);
      expect(!result.ok && result.error.code).toBe('ADDRESS_NOT_FOUND');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('도로명 주소가 다른 결과가 여러 개면 ADDRESS_AMBIGUOUS와 후보 목록', async () => {
    respondWith({ ...ansan, documents: [...ansan.documents, ...oryu.documents] });
    const result = await geocodeAddress('어떤 주소');
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'ADDRESS_AMBIGUOUS',
        message: GEOCODE_ERRORS.ADDRESS_AMBIGUOUS,
        candidates: [
          {
            roadAddress: '경기 안산시 상록구 한양대학로 55',
            jibunAddress: '경기 안산시 상록구 사동 1271',
          },
          { roadAddress: '서울 구로구 경인로 20', jibunAddress: '서울 구로구 오류동 108-1' },
        ],
      },
    });
  });

  it('같은 도로명 주소가 여러 번 나오면 하나로 보고 성공', async () => {
    respondWith({ ...ansan, documents: [...ansan.documents, ...ansan.documents] });
    const result = await geocodeAddress('경기 안산시 상록구 한양대학로 55');
    expect(result.ok).toBe(true);
  });

  it('모양이 이상한 결과가 섞여 있으면 그것만 빼고 나머지로 처리한다', async () => {
    const broken = { ...oryu.documents[0], address: { ...oryu.documents[0].address, b_code: '' } };
    respondWith({ ...ansan, documents: [...ansan.documents, broken] });
    const result = await geocodeAddress('경기 안산시 상록구 한양대학로 55');
    expect(result.ok && result.data.region.sigunguCode).toBe('41271');
  });

  describe('카카오를 쓸 수 없으면 GEOCODE_UNAVAILABLE이고 후보는 없다', () => {
    const unavailable = {
      ok: false,
      error: { code: 'GEOCODE_UNAVAILABLE', message: GEOCODE_ERRORS.GEOCODE_UNAVAILABLE },
    };

    it('카카오가 오류 상태(401, 500)를 돌려줄 때', async () => {
      for (const status of [401, 500]) {
        respondWith({ errorType: 'Error', message: 'error' }, status);
        expect(await geocodeAddress('경기 안산시 상록구 한양대학로 55')).toEqual(unavailable);
      }
    });

    it('시간 초과나 네트워크 오류로 호출이 실패할 때', async () => {
      fetchMock.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'));
      expect(await geocodeAddress('경기 안산시 상록구 한양대학로 55')).toEqual(unavailable);
    });

    it('응답 모양이 다를 때(결과가 모두 이상하거나 목록이 없음)', async () => {
      respondWith({ documents: [{ x: '1', y: '2' }] });
      expect(await geocodeAddress('경기 안산시 상록구 한양대학로 55')).toEqual(unavailable);
      respondWith({ meta: {} });
      expect(await geocodeAddress('경기 안산시 상록구 한양대학로 55')).toEqual(unavailable);
    });

    it('REST 키가 없을 때는 카카오를 부르지 않는다', async () => {
      vi.stubEnv('KAKAO_REST_API_KEY', '');
      expect(await geocodeAddress('경기 안산시 상록구 한양대학로 55')).toEqual(unavailable);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
