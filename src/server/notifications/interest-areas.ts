'use server';

// 관심 동네 읽기·바꾸기 (C-601 화면 정찬형 J14, 연결 #12 #131). 화면에서는 '@/server/notifications/interest-areas'에서 가져온다.
// 동네는 정찬형님 동네 고르기 목록(REGIONS, src/features/map/regions.ts)에 있는 것만 받는다.
// 관심 동네·찜한 샵 새 매물 알림 동의(interest_alert)는 저장 조건이 아니고 알림을 보낼 때 본다(동의 저장은 setOptionalConsent, #47 5장, #267).

import { z } from 'zod';

import { getDb } from '@/db';
import { REGIONS } from '@/features/map/regions';
import { fail, ok, type Result } from '@/lib/result';
import { requireCustomer } from '@/server/auth';

import { NOTIFICATION_ERRORS } from './errors';
import { readInterestAreas, replaceInterestAreas } from './interest-store';

const REGION_CODES = REGIONS.map((region) => region.code);

/** 동네 고르기 목록 순서로 정렬하고 겹침을 없앤다 */
function inRegionOrder(codes: readonly string[]): string[] {
  return REGION_CODES.filter((code) => codes.includes(code));
}

/** 내 관심 동네(시·군·구 코드) */
export async function getInterestAreas(): Promise<Result<{ sigunguCodes: string[] }>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  const stored = await readInterestAreas(getDb(), auth.data.customerId);
  return ok({ sigunguCodes: inRegionOrder(stored) });
}

const codesSchema = z.array(z.string().max(10)).max(50);

/** 관심 동네를 고른 목록으로 바꾼다. 빈 목록이면 모두 지운다 */
export async function setInterestAreas(
  sigunguCodes: string[],
): Promise<Result<{ sigunguCodes: string[] }>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  const parsed = codesSchema.safeParse(sigunguCodes);
  if (!parsed.success) return fail('INVALID_INPUT', NOTIFICATION_ERRORS.INVALID_INPUT);
  if (parsed.data.some((code) => !REGION_CODES.includes(code))) {
    return fail('INVALID_REGION', NOTIFICATION_ERRORS.INVALID_REGION);
  }

  const codes = inRegionOrder(parsed.data);
  await getDb().transaction((tx) => replaceInterestAreas(tx, auth.data.customerId, codes));
  return ok({ sigunguCodes: codes });
}
