import { describe, expect, it } from 'vitest';

import {
  addRecentSearch,
  parseRecentSearches,
  RECENT_SEARCH_LIMIT,
  removeRecentSearch,
  searchListHref,
} from './search-rules';

const query = (href: string) => new URL(href, 'http://localhost').searchParams;

describe('검색 결과 주소 (C-210)', () => {
  it('홈에서 찾으면 검색어만 가진 매물 목록', () => {
    const href = searchListHref('  한대앞   펌 ', null);
    expect(href.startsWith('/home/list?')).toBe(true);
    expect([...query(href)]).toEqual([['q', '한대앞 펌']]);
  });

  it('매물 목록에서 다시 찾으면 필터·정렬·동네 링크는 그대로 두고 검색어만 바꾼다', () => {
    const current = new URLSearchParams(
      'category=hair&service=perm&sort=discount&q=커트&region=41273',
    );
    const next = query(searchListHref('펌', current));
    expect(next.get('q')).toBe('펌');
    expect(next.get('category')).toBe('hair');
    expect(next.getAll('service')).toEqual(['perm']);
    expect(next.get('sort')).toBe('discount');
    expect(next.get('region')).toBe('41273');
  });

  it('검색어가 비었으면 검색만 푼다', () => {
    expect(searchListHref('  ', new URLSearchParams('q=펌&sort=discount'))).toBe(
      '/home/list?sort=discount',
    );
    expect(searchListHref('', new URLSearchParams('q=펌'))).toBe('/home/list');
  });
});

describe('최근 검색어 (C-210, 이 기기에만)', () => {
  it('새로 찾은 것을 맨 앞에, 이미 있으면 맨 앞으로 옮긴다', () => {
    expect(addRecentSearch(['커트', '펌'], '염색')).toEqual(['염색', '커트', '펌']);
    expect(addRecentSearch(['커트', '펌'], ' 펌 ')).toEqual(['펌', '커트']);
  });

  it('상한을 넘으면 오래된 것부터 뺀다', () => {
    const full = Array.from({ length: RECENT_SEARCH_LIMIT }, (_, i) => `검색${i}`);
    const next = addRecentSearch(full, '새 검색');
    expect(next).toHaveLength(RECENT_SEARCH_LIMIT);
    expect(next[0]).toBe('새 검색');
    expect(next).not.toContain(full[RECENT_SEARCH_LIMIT - 1]);
  });

  it('빈 검색어는 남기지 않는다', () => {
    expect(addRecentSearch(['커트'], '   ')).toEqual(['커트']);
  });

  it('하나만 지운다', () => {
    expect(removeRecentSearch(['펌', '커트', '염색'], '커트')).toEqual(['펌', '염색']);
  });

  it('저장해 둔 값: 모양이 틀리면 버리고, 글자만 겹치지 않게 상한까지', () => {
    expect(parseRecentSearches(null)).toEqual([]);
    expect(parseRecentSearches('깨진 값')).toEqual([]);
    expect(parseRecentSearches('{"q":"펌"}')).toEqual([]);
    expect(parseRecentSearches(JSON.stringify(['펌', 3, ' 펌 ', '', '커트']))).toEqual([
      '펌',
      '커트',
    ]);
    const many = Array.from({ length: RECENT_SEARCH_LIMIT + 5 }, (_, i) => `검색${i}`);
    expect(parseRecentSearches(JSON.stringify(many))).toHaveLength(RECENT_SEARCH_LIMIT);
  });
});
