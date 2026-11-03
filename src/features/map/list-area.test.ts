import { describe, expect, it } from 'vitest';

import { resolveListArea, sigunguCodeFromRegionResponse } from './list-area';
import { findRegion } from './regions';

describe('내 위치가 속한 시·군·구 (#215)', () => {
  it('카카오 응답의 법정동(B) 코드 앞 5자리', () => {
    expect(
      sigunguCodeFromRegionResponse({
        documents: [
          { region_type: 'B', code: '4127310100', region_2depth_name: '안산시 단원구' },
          { region_type: 'H', code: '4127355000', region_2depth_name: '안산시 단원구' },
        ],
      }),
    ).toBe('41273');
  });

  it('세종은 시·도 코드 뒤 110', () => {
    expect(
      sigunguCodeFromRegionResponse({ documents: [{ region_type: 'B', code: '3611010100' }] }),
    ).toBe('36110');
  });

  it('법정동이 없거나 모양이 이상하면 null(바다 위 등)', () => {
    expect(sigunguCodeFromRegionResponse({ documents: [] })).toBeNull();
    expect(
      sigunguCodeFromRegionResponse({ documents: [{ region_type: 'H', code: '4127355000' }] }),
    ).toBeNull();
    expect(
      sigunguCodeFromRegionResponse({ documents: [{ region_type: 'B', code: '41273' }] }),
    ).toBeNull();
    expect(sigunguCodeFromRegionResponse(null)).toBeNull();
  });
});

describe('매물 목록 범위', () => {
  it('고른 동네면 그 시·군·구와 중심', async () => {
    const region = findRegion('41271')!;
    expect(await resolveListArea({ kind: 'region', point: region.center, region })).toEqual({
      sigunguCode: '41271',
      label: '안산시 상록구',
      origin: region.center,
      fromMyLocation: false,
    });
  });
});
