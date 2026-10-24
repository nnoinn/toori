// 고객의 지금 위치·고른 동네를 쿠키에서 읽는다 (C-102, #19 D9). 홈·지도(J3)·목록(J4)이 쓴다.
// 쿠키를 읽으므로 이 함수를 쓰는 서버 컴포넌트는 <Suspense> 안에 둔다(Cache Components).

import 'server-only';

import { cookies } from 'next/headers';
import { z } from 'zod';

import { LOCATION_COOKIES, MY_LOCATION_ENABLED } from './location-config';
import { findRegion, type Region } from './regions';

export type LatLng = { lat: number; lng: number };

export type CustomerLocation =
  /** 브라우저에서 받은 내 위치. region은 예전에 고른 동네(없으면 null) */
  | { kind: 'myLocation'; point: LatLng; region: Region | null }
  /** 고른 동네. point는 그 동네의 중심 좌표 */
  | { kind: 'region'; point: LatLng; region: Region };

export const latLngSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
});

export function serializeLatLng({ lat, lng }: LatLng): string {
  return `${lat},${lng}`;
}

/** 쿠키 값 "위도,경도"를 읽는다. 모양이 이상하면 null */
export function parseLatLng(value: string | undefined): LatLng | null {
  if (!value) return null;
  const parts = value.split(',');
  if (parts.length !== 2 || parts.some((part) => part.trim() === '')) return null;
  const parsed = latLngSchema.safeParse({ lat: Number(parts[0]), lng: Number(parts[1]) });
  return parsed.success ? parsed.data : null;
}

/** 두 쿠키 값으로 지금 위치를 정한다. 내 위치가 있으면 내 위치, 없으면 고른 동네, 둘 다 없으면 null */
export function resolveCustomerLocation(cookieValues: {
  region?: string;
  myLocation?: string;
}): CustomerLocation | null {
  const region = cookieValues.region ? (findRegion(cookieValues.region) ?? null) : null;
  const point = MY_LOCATION_ENABLED ? parseLatLng(cookieValues.myLocation) : null;
  if (point) return { kind: 'myLocation', point, region };
  if (region) return { kind: 'region', point: region.center, region };
  return null;
}

export async function getCustomerLocation(): Promise<CustomerLocation | null> {
  const store = await cookies();
  return resolveCustomerLocation({
    region: store.get(LOCATION_COOKIES.region)?.value,
    myLocation: store.get(LOCATION_COOKIES.myLocation)?.value,
  });
}
