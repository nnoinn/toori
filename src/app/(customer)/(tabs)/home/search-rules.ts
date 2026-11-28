// 검색 칸 규칙 (C-210). 홈 동네 바와 매물 목록 맨 윗줄의 검색 칸이 쓴다.
// 검색 결과는 매물 목록(/home/list?q=)이다. 매물 목록에서 다시 찾으면 고른 필터·정렬은 그대로 두고 검색어만 바꾼다.
// 최근 검색어는 이 기기(localStorage)에만 남긴다(🟡 docs/stage3-spec.md C-210). 서버에는 보내지 않는다.
// 브라우저 저장소 값은 받아서 판단만 한다(테스트할 수 있게). 읽고 쓰는 것은 search-box.tsx

import { parseSearchKeyword, SEARCH_MAX_LENGTH, SEARCH_PARAM } from '@/features/map/search';

import { listHref } from './lobby-rules';

/**
 * 검색 결과 매물 목록 주소. current를 주면(매물 목록에서 다시 찾기) 다른 주소창 값(필터·정렬·동네 링크)은 그대로 둔다.
 * 검색어가 비었으면 검색만 푼다. 예: searchListHref('펌', null) → /home/list?q=%ED%8E%8C
 */
export function searchListHref(text: string, current: URLSearchParams | null): string {
  const next = new URLSearchParams(current ?? undefined);
  const keyword = parseSearchKeyword(text);
  if (keyword) next.set(SEARCH_PARAM, keyword.text);
  else next.delete(SEARCH_PARAM);
  return listHref(next);
}

/** 최근 검색어를 두는 곳(localStorage) */
export const RECENT_SEARCH_KEY = 'toori:recent-searches';

/** 최근 검색어는 이만큼만 남긴다(새것부터) */
export const RECENT_SEARCH_LIMIT = 10;

/** 저장해 둔 값을 읽는다. 모양이 틀린 값은 버리고, 겹치지 않게 상한까지 */
export function parseRecentSearches(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const texts = value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => parseSearchKeyword(item.slice(0, SEARCH_MAX_LENGTH))?.text)
      .filter((text): text is string => text !== undefined);
    return [...new Set(texts)].slice(0, RECENT_SEARCH_LIMIT);
  } catch {
    return [];
  }
}

/** 찾은 검색어를 맨 앞에 더한다. 이미 있으면 맨 앞으로 옮기고, 상한을 넘으면 오래된 것부터 뺀다 */
export function addRecentSearch(list: readonly string[], text: string): string[] {
  const keyword = parseSearchKeyword(text);
  if (!keyword) return [...list];
  return [keyword.text, ...list.filter((item) => item !== keyword.text)].slice(
    0,
    RECENT_SEARCH_LIMIT,
  );
}

/** 최근 검색어 하나를 지운다 */
export function removeRecentSearch(list: readonly string[], text: string): string[] {
  return list.filter((item) => item !== text);
}
