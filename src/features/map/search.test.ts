import { describe, expect, it } from 'vitest';

import {
  containsPattern,
  matchesSearchKeyword,
  parseSearchKeyword,
  SEARCH_MAX_LENGTH,
  SEARCH_MAX_WORDS,
  serviceTypesMatching,
} from './search';

describe('검색어 읽기 (C-210)', () => {
  it('앞뒤 빈칸을 지우고 빈칸을 하나로, 단어로 나눈다', () => {
    expect(parseSearchKeyword('  한대앞   펌 ')).toEqual({
      text: '한대앞 펌',
      words: ['한대앞', '펌'],
    });
  });

  it('비었거나 빈칸뿐이면 null', () => {
    expect(parseSearchKeyword(undefined)).toBeNull();
    expect(parseSearchKeyword('')).toBeNull();
    expect(parseSearchKeyword('   ')).toBeNull();
  });

  it('주소창에 여러 번 오면 첫 번째', () => {
    expect(parseSearchKeyword(['커트', '펌'])?.text).toBe('커트');
  });

  it('같은 단어는 한 번만, 단어 수와 길이는 상한까지', () => {
    expect(parseSearchKeyword('펌 펌 커트')).toEqual({ text: '펌 커트', words: ['펌', '커트'] });
    const many = Array.from({ length: SEARCH_MAX_WORDS + 2 }, (_, i) => `단어${i}`).join(' ');
    expect(parseSearchKeyword(many)?.words).toHaveLength(SEARCH_MAX_WORDS);
    const long = '가'.repeat(SEARCH_MAX_LENGTH + 10);
    expect(parseSearchKeyword(long)?.text).toHaveLength(SEARCH_MAX_LENGTH);
  });
});

describe('검색어 맞추기 (C-210)', () => {
  it('% _ \\ 는 글자 그대로 찾는다', () => {
    expect(containsPattern('50%')).toBe('%50\\%%');
    expect(containsPattern('a_b')).toBe('%a\\_b%');
    expect(containsPattern('a\\b')).toBe('%a\\\\b%');
    expect(containsPattern('펌')).toBe('%펌%');
  });

  it('서비스 종류는 이름에 단어가 들어 있으면 맞는다(정책값 이름)', () => {
    expect(serviceTypesMatching('펌')).toEqual(['perm', 'lash_perm']);
    expect(serviceTypesMatching('네일')).toEqual(['gel_nail']);
    expect(serviceTypesMatching('없는말')).toEqual([]);
  });

  it('단어마다 샵 이름·메뉴 이름·서비스 종류 중 한 곳에 있으면 맞고, 모든 단어가 맞아야 한다', () => {
    const slot = { shopName: '샘플 헤어 한대앞', menuName: '볼륨 매직', serviceType: 'perm' };
    expect(matchesSearchKeyword(parseSearchKeyword('한대앞')!, slot)).toBe(true);
    expect(matchesSearchKeyword(parseSearchKeyword('매직')!, slot)).toBe(true);
    // 메뉴 이름에 없어도 서비스 종류 이름(펌)으로 맞는다
    expect(matchesSearchKeyword(parseSearchKeyword('한대앞 펌')!, slot)).toBe(true);
    expect(matchesSearchKeyword(parseSearchKeyword('한대앞 커트')!, slot)).toBe(false);
  });

  it('영문은 대소문자를 가리지 않는다', () => {
    expect(matchesSearchKeyword(parseSearchKeyword('toori')!, { shopName: 'Toori Hair' })).toBe(
      true,
    );
  });

  it('메뉴 이름·서비스 종류를 모르면 샵 이름으로만 본다(시간대 카드)', () => {
    const card = { shopName: '샘플 헤어 한대앞' };
    expect(matchesSearchKeyword(parseSearchKeyword('한대앞')!, card)).toBe(true);
    expect(matchesSearchKeyword(parseSearchKeyword('펌')!, card)).toBe(false);
  });
});
