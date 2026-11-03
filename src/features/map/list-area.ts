// 지도 없는 매물 목록의 범위 (#215, 11/3 결정). 서버에서만 부른다.
// 고른 동네면 그 시·군·구, 내 위치면 내 위치가 속한 시·군·구(카카오 좌표 → 행정구역, 법정동 코드 앞 5자리).
// 찾지 못하면 null이고, 화면은 동네를 고르게 한다. 카카오 REST 키(KAKAO_REST_API_KEY)는 서버에서만 쓴다.

import 'server-only';

import { z } from 'zod';

import type { CustomerLocation } from './location';
import { findRegion } from './regions';
import type { LatLng } from './types';

export type ListArea = {
  /** 시·군·구 코드. 예: 41273 */
  sigunguCode: string;
  /** 화면에 보여줄 이름. 예: 안산시 단원구 */
  label: string;
  /** 거리순 기준점: 내 위치, 또는 고른 동네의 중심 */
  origin: LatLng;
  /** 내 위치로 정한 범위인지(제목에 "내 위치"를 붙인다) */
  fromMyLocation: boolean;
};

const regionDocumentsSchema = z.object({
  documents: z.array(
    z.object({
      region_type: z.string(),
      code: z.string(),
      region_2depth_name: z.string().optional(),
    }),
  ),
});

/** 카카오 좌표 → 행정구역 응답에서 법정동(B) 코드의 앞 5자리. 없으면 null */
export function sigunguCodeFromRegionResponse(body: unknown): string | null {
  const parsed = regionDocumentsSchema.safeParse(body);
  if (!parsed.success) return null;
  const legal = parsed.data.documents.find((doc) => doc.region_type === 'B');
  return legal && /^\d{10}$/.test(legal.code) ? legal.code.slice(0, 5) : null;
}

/** 좌표가 속한 시·군·구 코드. 카카오를 부르지 못하거나 찾지 못하면 null */
async function sigunguCodeAt({ lat, lng }: LatLng): Promise<string | null> {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return null;
  const url = new URL('https://dapi.kakao.com/v2/local/geo/coord2regioncode.json');
  url.searchParams.set('x', String(lng));
  url.searchParams.set('y', String(lat));
  try {
    const response = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
    if (!response.ok) return null;
    return sigunguCodeFromRegionResponse(await response.json());
  } catch {
    return null;
  }
}

/** 지금 위치(쿠키)로 매물 목록의 범위를 정한다 */
export async function resolveListArea(location: CustomerLocation): Promise<ListArea | null> {
  if (location.kind === 'region') {
    return {
      sigunguCode: location.region.code,
      label: location.region.sigungu,
      origin: location.point,
      fromMyLocation: false,
    };
  }
  const sigunguCode = await sigunguCodeAt(location.point);
  if (!sigunguCode) return null;
  return {
    sigunguCode,
    label: findRegion(sigunguCode)?.sigungu ?? '내 위치 주변',
    origin: location.point,
    fromMyLocation: true,
  };
}
