import { describe, expect, it } from 'vitest';

import { GEOCODE_ERRORS, geocodeAddress } from './geocode';

// 가짜 결과 버전(J0)이 #51 3장의 약속대로 동작하는지 본다.
describe('geocodeAddress (가짜 결과 버전)', () => {
  it('그 밖의 주소는 성공하고, 받은 주소와 안산시 상록구 좌표·지역을 돌려준다', async () => {
    const result = await geocodeAddress('경기 안산시 상록구 한양대학로 55');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.roadAddress).toBe('경기 안산시 상록구 한양대학로 55');
    expect(result.data.region).toEqual({
      sido: '경기',
      sigungu: '안산시 상록구',
      sigunguCode: '41271',
    });
    expect(typeof result.data.lat).toBe('number');
    expect(typeof result.data.lng).toBe('number');
  });

  it('앞뒤 공백은 지우고 돌려준다', async () => {
    const result = await geocodeAddress('  경기 안산시 상록구 한양대학로 55 ');
    expect(result.ok && result.data.roadAddress).toBe('경기 안산시 상록구 한양대학로 55');
  });

  it("'없는주소'가 들어 있으면 ADDRESS_NOT_FOUND", async () => {
    const result = await geocodeAddress('경기 안산시 없는주소 1');
    expect(result).toEqual({
      ok: false,
      error: { code: 'ADDRESS_NOT_FOUND', message: GEOCODE_ERRORS.ADDRESS_NOT_FOUND },
    });
  });

  it('빈 주소는 ADDRESS_NOT_FOUND', async () => {
    for (const address of ['', '   ']) {
      const result = await geocodeAddress(address);
      expect(!result.ok && result.error.code).toBe('ADDRESS_NOT_FOUND');
    }
  });

  it("'여러개'가 들어 있으면 ADDRESS_AMBIGUOUS와 후보 2개", async () => {
    const result = await geocodeAddress('경기 안산시 여러개로 1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('ADDRESS_AMBIGUOUS');
    expect(result.error.message).toBe(GEOCODE_ERRORS.ADDRESS_AMBIGUOUS);
    expect(result.error.candidates).toHaveLength(2);
    for (const candidate of result.error.candidates ?? []) {
      expect(candidate.roadAddress).not.toBe('');
    }
  });

  it("'오류'가 들어 있으면 GEOCODE_UNAVAILABLE이고 후보는 없다", async () => {
    const result = await geocodeAddress('경기 안산시 오류로 1');
    expect(result).toEqual({
      ok: false,
      error: { code: 'GEOCODE_UNAVAILABLE', message: GEOCODE_ERRORS.GEOCODE_UNAVAILABLE },
    });
  });
});
