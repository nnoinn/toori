import { describe, expect, it } from 'vitest';

import {
  applyFiltersToSearch,
  countActiveFilters,
  EMPTY_FILTERS,
  parseFilters,
  MIN_DISCOUNT_OPTIONS,
  selectCategory,
  selectMinDiscount,
  togglePrice,
  toggleService,
  toggleTime,
  type HomeFilters,
} from './filters';

const hair = (patch: Partial<HomeFilters> = {}): HomeFilters => ({
  ...EMPTY_FILTERS,
  category: 'hair',
  ...patch,
});

describe('parseFilters', () => {
  it('값이 없으면 전체', () => {
    expect(parseFilters({})).toEqual(EMPTY_FILTERS);
  });

  it('업종과 그 업종의 서비스 종류를 읽는다', () => {
    expect(parseFilters({ category: 'hair', service: ['cut', 'perm'] })).toEqual(
      hair({ services: ['cut', 'perm'] }),
    );
  });

  it('목록에 없는 업종이면 업종·서비스 종류는 전체로 본다', () => {
    expect(parseFilters({ category: 'spa', service: 'cut' })).toEqual(EMPTY_FILTERS);
  });

  it('업종 없이 서비스 종류만 있으면 버린다', () => {
    expect(parseFilters({ service: 'cut' })).toEqual(EMPTY_FILTERS);
  });

  it('고른 업종에 없는 서비스 종류와 중복은 버린다', () => {
    expect(
      parseFilters({ category: 'nail_lash', service: ['cut', 'gel_nail', 'gel_nail'] }).services,
    ).toEqual(['gel_nail']);
  });

  it('가격대·시간대·할인율은 업종과 상관없이 정책 선택지에 있는 것만 읽는다', () => {
    expect(
      parseFilters({
        price: ['30k_50k', 'under_30k', 'free', '30k_50k'],
        time: ['evening', 'night'],
        discount: ['30', '50', '35', 'abc', '30'],
      }),
    ).toEqual({
      ...EMPTY_FILTERS,
      prices: ['30k_50k', 'under_30k'],
      times: ['evening'],
      minDiscount: 30,
    });
  });
});

describe('applyFiltersToSearch', () => {
  it('필터를 주소창 값으로 바꾸고 다른 값은 그대로 둔다', () => {
    const next = applyFiltersToSearch(
      new URLSearchParams('sort=near&service=old&price=old'),
      hair({
        services: ['cut', 'color'],
        prices: ['50k_100k'],
        times: ['morning'],
        minDiscount: 40,
      }),
    );
    expect(next.toString()).toBe(
      'sort=near&category=hair&service=cut&service=color&price=50k_100k&time=morning&discount=40',
    );
  });

  it('전체로 돌리면 필터 값을 모두 지운다', () => {
    expect(
      applyFiltersToSearch(
        new URLSearchParams('category=hair&service=cut&price=under_30k&time=evening&discount=10'),
        EMPTY_FILTERS,
      ).toString(),
    ).toBe('');
  });

  it('쓰고 다시 읽으면 같은 값이 된다', () => {
    const filters = {
      category: 'nail_lash',
      services: ['lash_perm'],
      prices: ['over_100k'],
      times: ['afternoon', 'evening'],
      minDiscount: 20,
    } satisfies HomeFilters;
    const search = applyFiltersToSearch(new URLSearchParams(), filters);
    const params = Object.fromEntries(
      ['category', 'service', 'price', 'time', 'discount'].map((key) => [key, search.getAll(key)]),
    );
    expect(parseFilters(params)).toEqual(filters);
  });
});

describe('선택 바꾸기', () => {
  it('업종을 바꾸면 서비스 종류만 비우고 나머지 선택은 그대로', () => {
    expect(
      selectCategory(
        hair({ services: ['cut'], prices: ['under_30k'], minDiscount: 30 }),
        'nail_lash',
      ),
    ).toEqual({
      ...EMPTY_FILTERS,
      category: 'nail_lash',
      prices: ['under_30k'],
      minDiscount: 30,
    });
  });

  it('같은 업종을 다시 고르면 그대로', () => {
    const filters = hair({ services: ['cut'] });
    expect(selectCategory(filters, 'hair')).toBe(filters);
  });

  it('버튼은 눌러서 켜고 끈다', () => {
    const on = toggleService(hair(), 'perm');
    expect(on.services).toEqual(['perm']);
    expect(toggleService(on, 'perm').services).toEqual([]);
    expect(togglePrice(EMPTY_FILTERS, 'under_30k').prices).toEqual(['under_30k']);
    expect(toggleTime(EMPTY_FILTERS, 'morning').times).toEqual(['morning']);
    expect(selectMinDiscount(EMPTY_FILTERS, 30).minDiscount).toBe(30);
    expect(selectMinDiscount(selectMinDiscount(EMPTY_FILTERS, 30), null).minDiscount).toBeNull();
  });

  it('고른 개수는 업종 1 + 고른 버튼 수', () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
    expect(
      countActiveFilters(
        hair({
          services: ['cut', 'perm'],
          prices: ['under_30k'],
          times: ['evening'],
          minDiscount: 10,
        }),
      ),
    ).toBe(6);
  });
});

describe('할인율 "N% 이상"', () => {
  it('선택지는 정책값에서 만들고, 가장 큰 값만 "이상"을 붙이지 않는다', () => {
    expect(MIN_DISCOUNT_OPTIONS.map((option) => option.label)).toEqual([
      '10% 이상',
      '20% 이상',
      '30% 이상',
      '40% 이상',
      '50%',
    ]);
  });

  it('주소에는 하나만 쓴다(여러 개가 와도 첫 번째 맞는 값)', () => {
    expect(parseFilters({ discount: ['35', '20', '40'] }).minDiscount).toBe(20);
    expect(parseFilters({ discount: 'abc' }).minDiscount).toBeNull();
    expect(
      applyFiltersToSearch(new URLSearchParams('discount=10&discount=20'), {
        ...EMPTY_FILTERS,
        minDiscount: 30,
      }).getAll('discount'),
    ).toEqual(['30']);
  });

  it('할인율을 고르면 필터 개수는 1만 늘어난다', () => {
    expect(countActiveFilters({ ...EMPTY_FILTERS, minDiscount: 30 })).toBe(1);
  });
});
