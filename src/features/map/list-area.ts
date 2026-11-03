// 지도 없는 매물 목록의 범위 (#215, 11/3 결정). 서버에서만 부른다.
// 고른 동네면 그 시·군·구, 내 위치면 내 위치가 속한 시·군·구(카카오 좌표 → 행정구역, 법정동 코드 앞 5자리).
// 찾지 못하면 null이고, 화면은 동네를 고르게 한다. 카카오 REST 키(KAKAO_REST_API_KEY)는 서버에서만 쓴다.

import 'server-only';

import { z } from 'zod';

import type { CustomerLocation } from './location';
import { findRegion, regionFullName } from './regions';
import type { LatLng } from './types';

export type ListArea = {
  /** 시·군·구 코드. 예: 41273 */
  sigunguCode: string;
  /** 화면에 보여줄 이름(regionFullName). 예: 안산시 단원구, 부산광역시 중구 */
  label: string;
  /** 거리순 기준점: 내 위치, 또는 고른 동네의 중심 */
  origin: LatLng;
  /** 내 위치로 정한 범위인지(제목에 "내 위치"를 붙인다) */
  fromMyLocation: boolean;
};

/** 카카오가 이 시간 안에 답하지 않으면 동네를 찾지 못한 것으로 본다(화면이 멈추지 않게, geocode.ts와 같은 값) */
const KAKAO_TIMEOUT_MS = 5000;

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
  if (!key) {
    console.error('[list-area] KAKAO_REST_API_KEY가 없어요');
    return null;
  }
  const url = new URL('https://dapi.kakao.com/v2/local/geo/coord2regioncode.json');
  url.searchParams.set('x', String(lng));
  url.searchParams.set('y', String(lat));
  try {
    const response = await fetch(url, {
      headers: { Authorization: `KakaoAK ${key}` },
      signal: AbortSignal.timeout(KAKAO_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`[list-area] 카카오 좌표→행정구역 실패: HTTP ${response.status}`);
      return null;
    }
    return sigunguCodeFromRegionResponse(await response.json());
  } catch (error) {
    // 좌표는 남기지 않는다(개인 위치)
    console.error(
      '[list-area] 카카오 좌표→행정구역 오류:',
      error instanceof Error ? error.name : 'unknown',
    );
    return null;
  }
}

/** 지금 위치(쿠키)로 매물 목록의 범위를 정한다 */
export async function resolveListArea(location: CustomerLocation): Promise<ListArea | null> {
  if (location.kind === 'region') {
    return {
      sigunguCode: location.region.code,
      label: regionFullName(location.region),
      origin: location.point,
      fromMyLocation: false,
    };
  }
  const sigunguCode = await sigunguCodeAt(location.point);
  if (!sigunguCode) return null;
  // 동네 목록에 없는 코드(카카오와 동네 목록의 행정구역 개편 반영 시점이 다를 때)도 샵 코드와는 맞으므로 그대로 쓴다
  const region = findRegion(sigunguCode);
  return {
    sigunguCode,
    label: region ? regionFullName(region) : '내 위치 주변',
    origin: location.point,
    fromMyLocation: true,
  };
}
