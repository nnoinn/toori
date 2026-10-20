import { pgTable, PgDialect, text } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { ewkbHexToGeoPoint, geoPointToEwkt, inValues } from './types';

describe('geoPointToEwkt', () => {
  it('경도·위도 순서로 SRID 4326 점을 만든다', () => {
    expect(geoPointToEwkt({ lng: 126.8312, lat: 37.3219 })).toBe(
      'SRID=4326;POINT(126.8312 37.3219)',
    );
  });

  it('숫자가 아닌 좌표는 거절한다', () => {
    expect(() => geoPointToEwkt({ lng: Number.NaN, lat: 37 })).toThrow();
    expect(() => geoPointToEwkt({ lng: 126, lat: Number.POSITIVE_INFINITY })).toThrow();
  });
});

describe('ewkbHexToGeoPoint', () => {
  it('PostGIS가 돌려주는 SRID 포함 점(리틀 엔디언)을 읽는다', () => {
    // SRID=4326;POINT(1 2)
    expect(ewkbHexToGeoPoint('0101000020E6100000000000000000F03F0000000000000040')).toEqual({
      lng: 1,
      lat: 2,
    });
  });

  it('SRID가 없는 점도 읽는다', () => {
    // POINT(1 2)
    expect(ewkbHexToGeoPoint('0101000000000000000000F03F0000000000000040')).toEqual({
      lng: 1,
      lat: 2,
    });
  });

  it('빅 엔디언 점도 읽는다', () => {
    // POINT(1 2), 빅 엔디언
    expect(ewkbHexToGeoPoint('00000000013FF00000000000004000000000000000')).toEqual({
      lng: 1,
      lat: 2,
    });
  });

  it('안산시 좌표를 저장했다가 읽어도 같은 값이 나온다', () => {
    const point = { lng: 126.8312345, lat: 37.3219876 };
    const buf = Buffer.alloc(25);
    buf.writeUInt8(1, 0);
    buf.writeUInt32LE(0x20000001, 1);
    buf.writeUInt32LE(4326, 5);
    buf.writeDoubleLE(point.lng, 9);
    buf.writeDoubleLE(point.lat, 17);
    expect(ewkbHexToGeoPoint(buf.toString('hex'))).toEqual(point);
  });

  it('점이 아닌 값(선)은 거절한다', () => {
    // LINESTRING 종류 번호 2
    expect(() => ewkbHexToGeoPoint('010200000000000000')).toThrow();
  });
});

describe('inValues', () => {
  const table = pgTable('t', { status: text() });
  const dialect = new PgDialect();

  it('목록 값을 따옴표로 감싼 in 조건을 만든다', () => {
    const query = dialect.sqlToQuery(inValues(table.status, ['pending', 'approved']));
    expect(query.sql).toBe(`"t"."status" in ('pending', 'approved')`);
    expect(query.params).toEqual([]);
  });

  it('작은따옴표가 들어 있어도 SQL이 깨지지 않게 두 번 쓴다', () => {
    const query = dialect.sqlToQuery(inValues(table.status, ["it's"]));
    expect(query.sql).toBe(`"t"."status" in ('it''s')`);
  });
});
