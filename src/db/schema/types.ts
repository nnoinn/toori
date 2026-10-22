// 스키마 파일들이 같이 쓰는 컬럼 타입과 도우미.
// 설계: docs/schema-v1.md 원칙(시간은 timestamptz, 상태 값은 check로 제한, 위치는 PostGIS).

import { type AnyColumn, type SQL, sql } from 'drizzle-orm';
import { customType, timestamp } from 'drizzle-orm/pg-core';

/** 위도·경도(WGS84). DB에는 geography(Point, 4326)로 저장한다 */
export type GeoPoint = { lng: number; lat: number };

const SRID = 4326;
// EWKB(PostGIS가 돌려주는 2진 형식)에서 "SRID가 들어 있음"을 뜻하는 표시와 점(Point)의 종류 번호
const EWKB_SRID_FLAG = 0x20000000;
const WKB_POINT = 1;

/** GeoPoint → DB에 넣을 글자(EWKT). 예: SRID=4326;POINT(126.84 37.29) */
export function geoPointToEwkt({ lng, lat }: GeoPoint): string {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    throw new Error('위치 좌표가 숫자가 아니에요.');
  }
  return `SRID=${SRID};POINT(${lng} ${lat})`;
}

/** DB에서 읽은 값(16진수 EWKB) → GeoPoint. 점(Point)만 다룬다 */
export function ewkbHexToGeoPoint(hex: string): GeoPoint {
  const buf = Buffer.from(hex, 'hex');
  const littleEndian = buf.readUInt8(0) === 1;
  const readUInt32 = (offset: number) =>
    littleEndian ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset);
  const readDouble = (offset: number) =>
    littleEndian ? buf.readDoubleLE(offset) : buf.readDoubleBE(offset);

  const type = readUInt32(1);
  if ((type & 0xff) !== WKB_POINT) {
    throw new Error('점(Point)이 아닌 위치 값이에요.');
  }
  // SRID가 들어 있으면 좌표 앞에 4바이트가 더 있다
  const coordOffset = type & EWKB_SRID_FLAG ? 9 : 5;
  return { lng: readDouble(coordOffset), lat: readDouble(coordOffset + 8) };
}

/**
 * PostGIS geography(Point, 4326) 컬럼(#15 D13).
 * Drizzle에는 geometry만 있어서 직접 정의한다. 거리 계산을 m 단위로 하려고 geography를 쓴다.
 * 확장 postgis는 extensions 스키마에 있고, 접속 search_path에 extensions가 들어 있어서 타입 이름만 쓴다.
 */
export const geographyPoint = customType<{ data: GeoPoint; driverData: string }>({
  dataType() {
    // 소문자로 쓴다: drizzle-kit은 대문자가 들어간 타입 이름을 따옴표로 감싸서 잘못된 SQL을 만든다
    return `geography(point, ${SRID})`;
  },
  toDriver(value) {
    return geoPointToEwkt(value);
  },
  fromDriver(value) {
    return ewkbHexToGeoPoint(value);
  },
});

/** timestamptz 컬럼(UTC로 저장). 화면 표시는 src/lib/time.ts */
export const timestamptz = () => timestamp({ withTimezone: true });

/** 만든 시각: 기본값 지금 */
export const createdAt = () => timestamptz().notNull().defaultNow();

/** 고친 시각: 기본값 지금, Drizzle로 고칠 때마다 지금으로 바뀐다 */
export const updatedAt = () =>
  timestamptz()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/**
 * check 제약용 "값이 목록 안에 있다" 조건.
 * check 제약은 값을 매개변수로 넘길 수 없어서 글자로 넣는다. 목록은 코드 안의 상수만 쓴다(사용자 입력 금지).
 */
export function inValues(column: AnyColumn, values: readonly string[]): SQL {
  const list = values.map((v) => `'${v.replaceAll("'", "''")}'`).join(', ');
  return sql`${column} in (${sql.raw(list)})`;
}
