'use server';

// 홈 지도·목록이 지도를 움직일 때마다 부르는 서버 함수 (J4, #19 D4·D8).
// 화면이 넘기는 값(영역·주소창 값·커서)은 믿지 않고 여기서 다시 확인한다.
// 고객 계정과 거리 기준점(내 위치·고른 동네)은 화면에서 받지 않고 서버가 쿠키로 정한다.

import { z } from 'zod';

import { getDb } from '@/db';
import { fail, ok, type Result } from '@/lib/result';
import { getCurrentAccount } from '@/server/auth';

import { parseFilters } from '../filters';
import { getCustomerLocation, latLngSchema } from '../location';
import type { MapBounds, MapShop } from '../types';
import { decodeCursor } from './cursor';
import { selectMapShops, selectSlotPage, type HomeSlotQuery } from './queries';
import { parseSort } from './sort';
import type { SlotListPage } from './types';

const LOAD_FAILED = '매물을 불러오지 못했어요. 잠시 후 다시 시도해 주세요';

const boundsSchema = z
  .object({ sw: latLngSchema, ne: latLngSchema })
  .refine(({ sw, ne }) => sw.lat <= ne.lat && sw.lng <= ne.lng);

const mapInputSchema = z.object({
  bounds: boundsSchema,
  /** 주소창 ? 뒤 값(필터·정렬). 화면과 같은 함수로 읽는다 */
  search: z.string().max(1000),
});

const pageInputSchema = mapInputSchema.extend({
  cursor: z.string().max(512).nullable(),
  shopId: z.uuid().nullable(),
});

type SearchValue = string | string[] | undefined;

/** 주소창 값 → parseFilters·parseSort가 읽는 모양(같은 이름이 여러 번이면 배열) */
function searchToParams(search: string): Record<string, SearchValue> {
  const params: Record<string, SearchValue> = {};
  for (const [key, value] of new URLSearchParams(search)) {
    const prev = params[key];
    params[key] = prev === undefined ? value : [...(Array.isArray(prev) ? prev : [prev]), value];
  }
  return params;
}

/** 고객 모드로 로그인한 고객 계정만. 원장님 모드로 둘러보면 null(#49 3장) */
async function currentCustomerId(): Promise<string | null> {
  const account = await getCurrentAccount();
  return account?.mode === 'customer' ? account.customerId : null;
}

async function baseQuery(bounds: MapBounds, search: string): Promise<HomeSlotQuery> {
  return {
    bounds,
    filters: parseFilters(searchToParams(search)),
    customerId: await currentCustomerId(),
    now: new Date(),
  };
}

/** 지도 마커(샵별 매물 수) */
export async function loadHomeMap(input: unknown): Promise<Result<{ shops: MapShop[] }>> {
  const parsed = mapInputSchema.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', LOAD_FAILED);
  try {
    const query = await baseQuery(parsed.data.bounds, parsed.data.search);
    return ok({ shops: await selectMapShops(getDb(), query) });
  } catch (error) {
    console.error('[loadHomeMap]', error);
    return fail('LOAD_FAILED', LOAD_FAILED);
  }
}

/** 목록 한 쪽(20개). serverNow는 카드 남은 시간 기준 */
export async function loadHomeSlots(
  input: unknown,
): Promise<Result<SlotListPage & { serverNow: string }>> {
  const parsed = pageInputSchema.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', LOAD_FAILED);
  const { bounds, search, cursor, shopId } = parsed.data;
  try {
    const [query, location] = await Promise.all([baseQuery(bounds, search), getCustomerLocation()]);
    const sort = parseSort(searchToParams(search).sort);
    // 위치 쿠키가 없으면(쿠키를 지운 직후 등) 지도 가운데를 기준점으로 쓴다
    const origin = location?.point ?? {
      lat: (bounds.sw.lat + bounds.ne.lat) / 2,
      lng: (bounds.sw.lng + bounds.ne.lng) / 2,
    };
    const page = await selectSlotPage(getDb(), {
      ...query,
      origin,
      sort,
      cursor: decodeCursor(cursor, sort),
      shopId,
    });
    return ok({ ...page, serverNow: query.now.toISOString() });
  } catch (error) {
    console.error('[loadHomeSlots]', error);
    return fail('LOAD_FAILED', LOAD_FAILED);
  }
}
