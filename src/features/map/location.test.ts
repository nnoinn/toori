import { describe, expect, it } from 'vitest';

import { MY_LOCATION_ENABLED } from './location-config';
import { parseLatLng, resolveCustomerLocation, serializeLatLng } from './location';
import { findRegion, REGIONS } from './regions';

describe('동네 목록', () => {
  it('안산시 상록구·단원구 2개이고 코드가 겹치지 않는다', () => {
    expect(REGIONS.map((region) => region.code)).toEqual(['41271', '41273']);
  });

  it('코드로 동네를 찾고, 없는 코드는 undefined', () => {
    expect(findRegion('41273')?.sigungu).toBe('안산시 단원구');
    expect(findRegion('11530')).toBeUndefined();
  });
});

describe('parseLatLng', () => {
  it('저장한 "위도,경도"를 그대로 읽는다', () => {
    const point = { lat: 37.2980046949606, lng: 126.834494326011 };
    expect(parseLatLng(serializeLatLng(point))).toEqual(point);
  });

  it('모양이 이상하거나 범위를 벗어나면 null', () => {
    for (const value of [
      undefined,
      '',
      '37.3',
      '37.3,',
      ',126.8',
      'a,b',
      '91,126.8',
      '37.3,181',
      '1,2,3',
    ]) {
      expect(parseLatLng(value)).toBeNull();
    }
  });
});

describe('resolveCustomerLocation', () => {
  const sangnok = findRegion('41271')!;

  it('쿠키가 없으면 null (처음 들어온 고객)', () => {
    expect(resolveCustomerLocation({})).toBeNull();
  });

  it('고른 동네만 있으면 그 동네 중심 좌표', () => {
    expect(resolveCustomerLocation({ region: '41271' })).toEqual({
      kind: 'region',
      point: sangnok.center,
      region: sangnok,
    });
  });

  it('목록에 없는 동네 코드는 무시한다', () => {
    expect(resolveCustomerLocation({ region: '99999' })).toBeNull();
  });

  it.runIf(!MY_LOCATION_ENABLED)(
    '내 위치가 꺼져 있으면 내 위치 쿠키는 무시하고 동네를 쓴다',
    () => {
      expect(resolveCustomerLocation({ region: '41271', myLocation: '37.3,126.8' })?.kind).toBe(
        'region',
      );
      expect(resolveCustomerLocation({ myLocation: '37.3,126.8' })).toBeNull();
    },
  );

  it.runIf(MY_LOCATION_ENABLED)(
    '내 위치가 있으면 내 위치를 먼저 쓰고, 고른 동네도 같이 준다',
    () => {
      expect(resolveCustomerLocation({ region: '41271', myLocation: '37.3,126.8' })).toEqual({
        kind: 'myLocation',
        point: { lat: 37.3, lng: 126.8 },
        region: sangnok,
      });
    },
  );
});
