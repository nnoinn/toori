// 카카오 로컬 REST API 부르기. 서버에서만 부른다(#241 리뷰).
// 주소 → 좌표(geocode.ts)와 좌표 → 행정구역(list-area.ts)이 같이 쓴다.
// 키 읽기, 헤더, 시간 제한, 응답 확인과 실패 기록을 여기 한 곳에 둔다. REST 키(KAKAO_REST_API_KEY)는 서버에서만 쓴다.

import 'server-only';

import type { z } from 'zod';

const KAKAO_LOCAL_URL = 'https://dapi.kakao.com/v2/local/';

/** 카카오가 이 시간 안에 답하지 않으면 실패로 본다(화면이 답을 기다리며 멈추지 않게) */
export const KAKAO_TIMEOUT_MS = 5000;

type KakaoLocalRequest<T> = {
  /** 실패 기록에 쓰는 이름. 예: 주소 검색 */
  name: string;
  /** KAKAO_LOCAL_URL 뒤 경로. 예: search/address.json */
  path: string;
  params: Record<string, string>;
  /** 응답 본문에서 쓰는 모양 */
  schema: z.ZodType<T>;
};

/**
 * 카카오 로컬 API를 불러 응답 본문을 schema로 확인해 돌려준다.
 * 키가 없거나 오류 상태·시간 초과·네트워크 오류·모양이 다른 응답이면 실패를 기록하고 null.
 * 기록에는 보낸 값(주소, 좌표)을 남기지 않는다(개인 위치일 수 있다).
 */
export async function fetchKakaoLocal<T>({
  name,
  path,
  params,
  schema,
}: KakaoLocalRequest<T>): Promise<T | null> {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) {
    console.error('[kakao-local] KAKAO_REST_API_KEY가 없어요');
    return null;
  }

  const url = new URL(path, KAKAO_LOCAL_URL);
  for (const [param, value] of Object.entries(params)) url.searchParams.set(param, value);

  try {
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${key}` },
      signal: AbortSignal.timeout(KAKAO_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[kakao-local] 카카오 ${name} 실패: HTTP ${res.status}`);
      return null;
    }
    const parsed = schema.safeParse(await res.json());
    if (!parsed.success) {
      console.error(`[kakao-local] 카카오 ${name} 응답 모양이 달라요`);
      return null;
    }
    return parsed.data;
  } catch (e) {
    console.error(`[kakao-local] 카카오 ${name} 호출 실패:`, e instanceof Error ? e.name : e);
    return null;
  }
}
