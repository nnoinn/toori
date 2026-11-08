import { describe, expect, it } from 'vitest';

import type { CustomerLocation } from './location';
import {
  regionFromParam,
  regionListHref,
  withLinkedRegion,
  withoutRegionParam,
} from './region-link';

describe('동네 링크', () => {
  it('시·군·구 코드면 그 동네', () => {
    expect(regionFromParam('41273')?.name).toBe('단원구');
  });

  it('같은 이름이 여러 번 오면 첫 값', () => {
    expect(regionFromParam(['41271', '41273'])?.code).toBe('41271');
  });

  it('없거나 모르는 코드면 null', () => {
    expect(regionFromParam(undefined)).toBeNull();
    expect(regionFromParam('')).toBeNull();
    expect(regionFromParam('99999')).toBeNull();
    expect(regionFromParam('41')).toBeNull();
  });

  it('링크의 동네가 있으면 저장된 위치 대신 그 동네를 쓴다', () => {
    const saved: CustomerLocation = {
      kind: 'myLocation',
      point: { lat: 37.3, lng: 126.8 },
      region: null,
    };
    const linked = withLinkedRegion(saved, '41273');
    expect(linked?.kind).toBe('region');
    expect(linked?.region?.code).toBe('41273');
    // 링크가 없거나 모르는 코드면 저장된 위치 그대로, 저장된 것도 없으면 null
    expect(withLinkedRegion(saved, undefined)).toBe(saved);
    expect(withLinkedRegion(saved, '99999')).toBe(saved);
    expect(withLinkedRegion(null, undefined)).toBeNull();
    expect(withLinkedRegion(null, '41273')?.region?.code).toBe('41273');
  });

  it('목록 주소를 만든다', () => {
    expect(regionListHref('41273')).toBe('/home/list?region=41273');
  });

  it('주소의 동네 값만 빼고 필터·정렬은 그대로 둔다', () => {
    expect(withoutRegionParam('/home/list', 'region=41273&sort=discount')).toBe(
      '/home/list?sort=discount',
    );
    expect(withoutRegionParam('/home/list', 'region=41273')).toBe('/home/list');
    expect(withoutRegionParam('/home/list', 'sort=discount')).toBeNull();
  });
});
