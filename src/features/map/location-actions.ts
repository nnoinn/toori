'use server';

// 고객 위치·동네를 쿠키에 저장하는 서버 함수 (C-102, #19 D9·D14). 좌표는 DB에 저장하지 않는다.

import { refresh } from 'next/cache';
import { cookies } from 'next/headers';

import { fail, ok, type Result } from '@/lib/result';
import { logLocationUse } from '@/server/auth/location-log';

import { LOCATION_COOKIE_MAX_AGE, LOCATION_COOKIES, MY_LOCATION_ENABLED } from './location-config';
import { latLngSchema, serializeLatLng } from './location';
import { findRegion } from './regions';

const cookieOptions = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
} as const;

/** 동네를 고른다. 위치정보가 아니라서 위치 이용 기록을 남기지 않는다(D14) */
export async function selectRegion(code: string): Promise<Result<null>> {
  const region = typeof code === 'string' ? findRegion(code) : undefined;
  if (!region) return fail('INVALID_REGION', '고를 수 없는 동네예요');

  const store = await cookies();
  store.set(LOCATION_COOKIES.region, region.code, {
    ...cookieOptions,
    maxAge: LOCATION_COOKIE_MAX_AGE.region,
  });
  // 동네를 직접 골랐으면 그 동네로 보여준다
  store.delete(LOCATION_COOKIES.myLocation);
  refresh();
  return ok(null);
}

/** 브라우저에서 새로 받은 내 위치를 저장한다 */
export async function saveMyLocation(point: unknown): Promise<Result<null>> {
  if (!MY_LOCATION_ENABLED) return fail('LOCATION_DISABLED', '지금은 동네를 골라 주세요');

  const parsed = latLngSchema.safeParse(point);
  if (!parsed.success)
    return fail('INVALID_LOCATION', '위치를 확인하지 못했어요. 동네를 골라 주세요');

  // 위치정보 이용 기록(위치정보법, #47 7장). 위치를 새로 받아 보낼 때 1번만 남긴다(D14).
  // 기록을 남기지 못하면 위치를 저장하지 않고 동네 선택으로 안내한다(기록 없이 위치를 쓰지 않는다)
  try {
    await logLocationUse('nearby_search');
  } catch {
    return fail('LOCATION_LOG_FAILED', '지금은 위치를 쓸 수 없어요. 동네를 골라 주세요');
  }

  const store = await cookies();
  store.set(LOCATION_COOKIES.myLocation, serializeLatLng(parsed.data), {
    ...cookieOptions,
    maxAge: LOCATION_COOKIE_MAX_AGE.myLocation,
  });
  refresh();
  return ok(null);
}
