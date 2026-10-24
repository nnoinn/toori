import { describe, expect, it } from 'vitest';

import {
  applyFiltersToSearch,
  countActiveFilters,
  EMPTY_FILTERS,
  parseFilters,
  selectCategory,
  toggleService,
} from './filters';

describe('parseFilters', () => {
  it('값이 없으면 전체', () => {
    expect(parseFilters({})).toEqual(EMPTY_FILTERS);
  });

  it('업종과 그 업종의 서비스 종류를 읽는다', () => {
    expect(parseFilters({ category: 'hair', service: ['cut', 'perm'] })).toEqual({
      category: 'hair',
      services: ['cut', 'perm'],
    });
  });

  it('목록에 없는 업종이면 전체로 본다', () => {
    expect(parseFilters({ category: 'spa', service: 'cut' })).toEqual(EMPTY_FILTERS);
  });

  it('업종 없이 서비스 종류만 있으면 버린다', () => {
    expect(parseFilters({ service: 'cut' })).toEqual(EMPTY_FILTERS);
  });

  it('고른 업종에 없는 서비스 종류와 중복은 버린다', () => {
    expect(
      parseFilters({ category: 'nail_lash', service: ['cut', 'gel_nail', 'gel_nail'] }),
    ).toEqual({ category: 'nail_lash', services: ['gel_nail'] });
  });
});

describe('applyFiltersToSearch', () => {
  it('필터를 주소창 값으로 바꾸고 다른 값은 그대로 둔다', () => {
    const next = applyFiltersToSearch(new URLSearchParams('sort=near&service=old'), {
      category: 'hair',
      services: ['cut', 'color'],
    });
    expect(next.toString()).toBe('sort=near&category=hair&service=cut&service=color');
  });

  it('전체로 돌리면 필터 값을 지운다', () => {
    expect(
      applyFiltersToSearch(
        new URLSearchParams('category=hair&service=cut'),
        EMPTY_FILTERS,
      ).toString(),
    ).toBe('');
  });

  it('읽고 다시 쓰면 같은 값이 된다', () => {
    const filters = { category: 'nail_lash', services: ['lash_perm'] } as const;
    const search = applyFiltersToSearch(new URLSearchParams(), {
      ...filters,
      services: [...filters.services],
    });
    expect(
      parseFilters({
        category: search.get('category') ?? undefined,
        service: search.getAll('service'),
      }),
    ).toEqual({
      category: 'nail_lash',
      services: ['lash_perm'],
    });
  });
});

describe('선택 바꾸기', () => {
  it('업종을 바꾸면 서비스 종류 선택을 비운다', () => {
    expect(selectCategory({ category: 'hair', services: ['cut'] }, 'nail_lash')).toEqual({
      category: 'nail_lash',
      services: [],
    });
  });

  it('같은 업종을 다시 고르면 그대로', () => {
    const filters = { category: 'hair' as const, services: ['cut' as const] };
    expect(selectCategory(filters, 'hair')).toBe(filters);
  });

  it('서비스 종류는 눌러서 켜고 끈다', () => {
    const on = toggleService({ category: 'hair', services: [] }, 'perm');
    expect(on.services).toEqual(['perm']);
    expect(toggleService(on, 'perm').services).toEqual([]);
  });

  it('고른 개수는 업종 1 + 서비스 종류 수', () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
    expect(countActiveFilters({ category: 'hair', services: ['cut', 'perm'] })).toBe(3);
  });
});
