import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { legalSigunguCode, resolveListArea } from './list-area';
import { findRegion } from './regions';

describe('내 위치가 속한 시·군·구 (#215)', () => {
  it('카카오 응답의 법정동(B) 코드 앞 5자리', () => {
    expect(
      legalSigunguCode({
        documents: [
          { region_type: 'B', code: '4127310100' },
          { region_type: 'H', code: '4127355000' },
        ],
      }),
    ).toBe('41273');
  });

  it('세종은 시·도 코드 뒤 110', () => {
    expect(legalSigunguCode({ documents: [{ region_type: 'B', code: '3611010100' }] })).toBe(
      '36110',
    );
  });

  it('법정동이 없거나 모양이 이상하면 null(바다 위 등)', () => {
    expect(legalSigunguCode({ documents: [] })).toBeNull();
    expect(legalSigunguCode({ documents: [{ region_type: 'H', code: '4127355000' }] })).toBeNull();
    expect(legalSigunguCode({ documents: [{ region_type: 'B', code: '41273' }] })).toBeNull();
  });
});

describe('매물 목록 범위', () => {
  // 내 위치는 카카오를 부르지 않고 fetch를 바꿔서 본다
  const fetchMock = vi.fn<typeof fetch>();
  const point = { lat: 37.3219, lng: 126.8309 };

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

  it('고른 동네면 그 시·군·구와 중심', async () => {
    const region = findRegion('41271')!;
    expect(await resolveListArea({ kind: 'region', point: region.center, region })).toEqual({
      sigunguCode: '41271',
      label: '안산시 상록구',
      origin: region.center,
      fromMyLocation: false,
    });
  });

  it('이름이 겹치는 동네는 시·도를 붙인 이름', async () => {
    const region = findRegion('26110')!;
    const area = await resolveListArea({ kind: 'region', point: region.center, region });
    expect(area?.label).toBe('부산광역시 중구');
  });

  it('내 위치면 그 위치가 속한 시·군·구', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ documents: [{ region_type: 'B', code: '4127310100' }] }),
    );
    expect(await resolveListArea({ kind: 'myLocation', point, region: null })).toEqual({
      sigunguCode: '41273',
      label: '안산시 단원구',
      origin: point,
      fromMyLocation: true,
    });
  });

  it('카카오가 답하지 않으면(시간 초과) 찾지 못한 것으로 본다', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'));
    expect(await resolveListArea({ kind: 'myLocation', point, region: null })).toBeNull();
  });
});
