// 동네 링크: /home/list?region=41273 (시·군·구 코드). 화면과 서버 어디서나 쓴다.
// 링크로 연 동네는 보기만 하고, 고객이 고른 동네(쿠키)는 바꾸지 않는다(11/4). 위쪽 동네 버튼으로 직접 고르면 주소의 값을 지운다.
// 관심 동네 알림을 눌렀을 때나 동네 매물을 공유할 때 쓴다.

import { firstParam, type SearchValue } from '@/lib/search-params';

import type { CustomerLocation } from './location';
import { findRegion, type Region } from './regions';

export const REGION_PARAM = 'region';

/** 주소창 ?region= 값의 동네. 없거나 모르는 코드면 null(평소처럼 고른 동네·내 위치로 보여준다) */
export function regionFromParam(value: SearchValue): Region | null {
  const code = firstParam(value);
  return code ? (findRegion(code) ?? null) : null;
}

/**
 * 목록에서 쓸 위치. 링크의 동네가 있으면 그 동네, 없으면 저장된 위치(고른 동네·내 위치).
 * 목록 화면(page.tsx)과 목록을 불러오는 서버 함수(loadRegionSlots)가 같은 규칙을 쓴다
 */
export function withLinkedRegion(
  saved: CustomerLocation | null,
  value: SearchValue,
): CustomerLocation | null {
  const linked = regionFromParam(value);
  return linked ? { kind: 'region', point: linked.center, region: linked } : saved;
}

/** 그 동네 매물 목록 주소. 예: "/home/list?region=41273" */
export function regionListHref(code: string): string {
  return `/home/list?${REGION_PARAM}=${encodeURIComponent(code)}`;
}

/** 주소의 동네 값을 뺀 주소(직접 동네를 고른 뒤). 다른 값(필터·정렬)은 그대로 둔다. 바뀔 게 없으면 null */
export function withoutRegionParam(pathname: string, search: string): string | null {
  const params = new URLSearchParams(search);
  if (!params.has(REGION_PARAM)) return null;
  params.delete(REGION_PARAM);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
