import { describe, expect, it } from 'vitest';

import { FEATURED_REGIONS, findRegion, REGION_SIDOS, REGIONS } from './regions';

describe('전국 동네 목록 (#200)', () => {
  it('시·군·구 코드는 다섯 자리이고 겹치지 않는다', () => {
    const codes = REGIONS.map((region) => region.code);
    expect(codes.every((code) => /^\d{5}$/.test(code))).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('안산시 상록구·단원구는 예전과 코드·이름이 같다(이미 고른 동네 쿠키·관심 동네가 그대로 맞게)', () => {
    expect(findRegion('41271')).toMatchObject({ name: '상록구', sigungu: '안산시 상록구' });
    expect(findRegion('41273')).toMatchObject({ name: '단원구', sigungu: '안산시 단원구' });
    // 예전 중심 좌표와 같다(소수 6자리)
    expect(findRegion('41271')?.center.lat).toBeCloseTo(37.3009718344204, 5);
    expect(findRegion('41273')?.center.lng).toBeCloseTo(126.815325520507, 5);
  });

  it('지금 영업하는 동네(안산 두 곳)를 맨 위에 둔다', () => {
    expect(FEATURED_REGIONS.map((region) => region.code)).toEqual(['41271', '41273']);
  });

  it('시·도마다 그 시·도 코드로 시작하는 시·군·구가 있다', () => {
    for (const sido of REGION_SIDOS) {
      expect(sido.regions.length).toBeGreaterThan(0);
      expect(sido.regions.every((region) => region.code.startsWith(sido.code))).toBe(true);
      expect(sido.regions.every((region) => region.sido === sido.name)).toBe(true);
    }
  });

  it('일반구가 있는 시는 시 대신 구를 고른다(샵의 시·군·구 코드가 구 코드라서)', () => {
    expect(findRegion('41270')).toBeUndefined(); // 안산시
    expect(findRegion('11680')?.sigungu).toBe('강남구');
  });

  it('세종은 시·도 하나를 동네로 쓴다', () => {
    expect(findRegion('36110')?.sigungu).toBe('세종특별자치시');
  });

  it('중심 좌표는 모두 우리나라 안이다', () => {
    for (const { center } of REGIONS) {
      expect(center.lat).toBeGreaterThan(33);
      expect(center.lat).toBeLessThan(39);
      expect(center.lng).toBeGreaterThan(124);
      expect(center.lng).toBeLessThan(132);
    }
  });

  it('없는 코드는 undefined', () => {
    expect(findRegion('99999')).toBeUndefined();
  });
});
