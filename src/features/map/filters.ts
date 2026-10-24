// 홈 필터 값 (J5, C-206). 주소창에 key로 둔다. 예: /?category=hair&service=cut&service=perm
// 업종·서비스 종류 목록은 정책 폴더(src/server/policy/catalog.ts, #48 7장)에서 가져온다.
// 가격대·시간대·할인율은 강규민님 정책값(W4)이 들어오면 더한다. 지역은 위쪽 동네 버튼(J2)으로 고른다.

import {
  SERVICE_TYPES_BY_CATEGORY,
  SHOP_CATEGORIES,
  type ServiceType,
  type ShopCategory,
} from '@/server/policy';

export type HomeFilters = {
  /** 고른 업종. 없으면 전체 */
  category: ShopCategory | null;
  /** 고른 서비스 종류. 업종을 골랐을 때만, 그 업종의 것만 */
  services: ServiceType[];
};

export const EMPTY_FILTERS: HomeFilters = { category: null, services: [] };

export const FILTER_PARAMS = { category: 'category', service: 'service' } as const;

type SearchValue = string | string[] | undefined;

function asList(value: SearchValue): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function isCategory(value: string): value is ShopCategory {
  return SHOP_CATEGORIES.some((category) => category.key === value);
}

export function serviceTypesOf(category: ShopCategory) {
  return SERVICE_TYPES_BY_CATEGORY[category];
}

/** 주소창 값을 읽는다. 목록에 없는 값과 고른 업종에 없는 서비스 종류는 버린다 */
export function parseFilters(params: Record<string, SearchValue>): HomeFilters {
  const rawCategory = asList(params[FILTER_PARAMS.category])[0];
  const category = rawCategory && isCategory(rawCategory) ? rawCategory : null;
  if (!category) return EMPTY_FILTERS;

  const allowed = new Set<string>(serviceTypesOf(category).map((type) => type.key));
  const services = [...new Set(asList(params[FILTER_PARAMS.service]))].filter(
    (key): key is ServiceType => allowed.has(key),
  );
  return { category, services };
}

/** 필터를 주소창 값으로 바꾼다. 필터가 아닌 다른 값은 그대로 둔다 */
export function applyFiltersToSearch(
  current: URLSearchParams,
  filters: HomeFilters,
): URLSearchParams {
  const next = new URLSearchParams(current);
  next.delete(FILTER_PARAMS.category);
  next.delete(FILTER_PARAMS.service);
  if (filters.category) {
    next.set(FILTER_PARAMS.category, filters.category);
    for (const service of filters.services) next.append(FILTER_PARAMS.service, service);
  }
  return next;
}

/** 업종을 바꾸면 서비스 종류 선택은 비운다(업종마다 목록이 달라서) */
export function selectCategory(filters: HomeFilters, category: ShopCategory | null): HomeFilters {
  return filters.category === category ? filters : { category, services: [] };
}

export function toggleService(filters: HomeFilters, service: ServiceType): HomeFilters {
  const services = filters.services.includes(service)
    ? filters.services.filter((key) => key !== service)
    : [...filters.services, service];
  return { ...filters, services };
}

/** 필터 버튼에 보여줄 고른 개수(업종 1 + 서비스 종류 수) */
export function countActiveFilters(filters: HomeFilters): number {
  return (filters.category ? 1 : 0) + filters.services.length;
}
