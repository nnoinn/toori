// 검색어 (C-210). 매물 목록 주소창 ?q= 에 두고, 목록 조회(slot-list/queries.ts)와 화면이 같은 함수로 읽는다.
// 범위는 지금 고른 동네이고 필터·정렬과 같이 쓴다(🟡 docs/stage3-spec.md C-210).
// 찾는 곳: 샵 이름, 메뉴 이름(원장님이 정한 이름), 서비스 종류 이름(커트·펌 같은 고정 목록, 정책값).
// 디자이너 이름(S-110)은 DB가 바뀐 뒤 더한다. 띄어 쓴 단어는 모두 맞아야 한다(단어마다 세 곳 중 한 곳에 들어 있으면 된다).
// 예: "한대앞 펌" → 샵 이름에 '한대앞'이 있고 메뉴나 서비스 종류에 '펌'이 있는 매물

import { SERVICE_TYPES_BY_CATEGORY, type ServiceType } from '@/server/policy';

export const SEARCH_PARAM = 'q';

/** 검색어 길이와 단어 수 상한. 넘는 부분은 버린다(조회 조건이 너무 길어지지 않게) */
export const SEARCH_MAX_LENGTH = 50;
export const SEARCH_MAX_WORDS = 5;

export type SearchKeyword = {
  /** 화면에 보여 주고 주소창에 두는 검색어(앞뒤 빈칸을 지우고 빈칸을 하나로) */
  text: string;
  /** 하나씩 맞춰 보는 단어(겹치지 않게, SEARCH_MAX_WORDS개까지) */
  words: string[];
};

type SearchValue = string | string[] | undefined;

/** 주소창 값(또는 입력한 글자)을 검색어로 읽는다. 비었으면 null */
export function parseSearchKeyword(value: SearchValue): SearchKeyword | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\s+/g, ' ').slice(0, SEARCH_MAX_LENGTH).trim();
  if (!trimmed) return null;
  const words = [...new Set(trimmed.split(' '))].slice(0, SEARCH_MAX_WORDS);
  return { text: words.join(' '), words };
}

/** 입력한 글자를 그대로 찾는 ilike 패턴(% _ \ 는 글자로 찾는다) */
export function containsPattern(word: string): string {
  return `%${word.replace(/[\\%_]/g, '\\$&')}%`;
}

const ALL_SERVICE_TYPES = Object.values(SERVICE_TYPES_BY_CATEGORY).flat();

function includesWord(text: string, word: string): boolean {
  return text.toLowerCase().includes(word.toLowerCase());
}

/** 이름에 그 단어가 들어 있는 서비스 종류. 예: "펌" → 펌, 속눈썹 펌 */
export function serviceTypesMatching(word: string): ServiceType[] {
  return ALL_SERVICE_TYPES.filter((type) => includesWord(type.label, word)).map((type) => type.key);
}

/**
 * 검색어에 맞는지 메모리에서 본다(목록 조회의 DB 조건과 같은 규칙). DB 조건으로 거르지 못하는 것(시간대 카드)에 쓴다.
 * 메뉴 이름·서비스 종류를 모르면 샵 이름으로만 본다
 */
export function matchesSearchKeyword(
  keyword: SearchKeyword,
  target: { shopName: string; menuName?: string; serviceType?: string },
): boolean {
  return keyword.words.every(
    (word) =>
      includesWord(target.shopName, word) ||
      (target.menuName !== undefined && includesWord(target.menuName, word)) ||
      (target.serviceType !== undefined &&
        (serviceTypesMatching(word) as readonly string[]).includes(target.serviceType)),
  );
}
