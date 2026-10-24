import { describe, expect, it } from 'vitest';

import { kakaoMapSdkUrl } from './map-config';

describe('kakaoMapSdkUrl', () => {
  it('직접 불러오기(autoload=false)와 마커 묶기(clusterer)를 켠 SDK 주소를 만든다', () => {
    const url = new URL(kakaoMapSdkUrl('test-key'));
    expect(url.origin + url.pathname).toBe('https://dapi.kakao.com/v2/maps/sdk.js');
    expect(url.searchParams.get('appkey')).toBe('test-key');
    expect(url.searchParams.get('autoload')).toBe('false');
    expect(url.searchParams.get('libraries')).toBe('clusterer');
  });
});
