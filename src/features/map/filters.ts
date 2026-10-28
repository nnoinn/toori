// 홈 필터 값 (J5, C-206). 주소창에 key로 둔다. 예: /?category=hair&service=cut&price=30k_50k&discount=30
// 업종·서비스 종류·가격대·시간대·할인율 선택지는 모두 정책 폴더(src/server/policy, #48)에서 가져온다(D7).
// 가격대·시간대는 여러 개 고른다(D7). 할인율은 "N% 이상" 하나만 고른다(10/25 결정, #95 리뷰).
// 지역은 위쪽 동네 버튼(J2, D24)으로 고른다.

import {
  DISCOUNT_RATE_OPTIONS,
  PRICE_FILTER_RANGES,
  SERVICE_TYPES_BY_CATEGORY,
  SHOP_CATEGORIES,
  TIME_FILTER_RANGES,
  type DiscountRate,
  type ServiceType,
  type ShopCategory,
} from '@/server/policy';

export type PriceRangeKey = (typeof PRICE_FILTER_RANGES)[number]['key'];
export type TimeRangeKey = (typeof TIME_FILTER_RANGES)[number]['key'];

export type HomeFilters = {
  /** 고른 업종. 없으면 전체 */
  category: ShopCategory | null;
  /** 고른 서비스 종류. 업종을 골랐을 때만, 그 업종의 것만 */
  services: ServiceType[];
  /** 할인가 구간(여러 개) */
  prices: PriceRangeKey[];
  /** 서비스 시작 시각 구간(여러 개) */
  times: TimeRangeKey[];
  /** 최소 할인율("N% 이상"). 없으면 전체 */
  minDiscount: DiscountRate | null;
};

export const EMPTY_FILTERS: HomeFilters = {
  category: null,
  services: [],
  prices: [],
  times: [],
  minDiscount: null,
};

/** 할인율 선택지. 가장 큰 값은 그 값뿐이라 "이상"을 붙이지 않는다. 예: 10% 이상 … 40% 이상, 50% */
export const MIN_DISCOUNT_OPTIONS = DISCOUNT_RATE_OPTIONS.map((rate) => ({
  rate,
  label: rate === Math.max(...DISCOUNT_RATE_OPTIONS) ? `${rate}%` : `${rate}% 이상`,
}));

export const FILTER_PARAMS = {
  category: 'category',
  service: 'service',
  price: 'price',
  time: 'time',
  discount: 'discount',
} as const;

type SearchValue = string | string[] | undefined;

function asList(value: SearchValue): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** 주소창 값 중 허용된 것만, 중복 없이, 처음 나온 순서대로 */
function pickAllowed<T extends string | number>(
  value: SearchValue,
  allowed: readonly T[],
  read: (raw: string) => T | string | number = (raw) => raw,
): T[] {
  const picked: T[] = [];
  for (const raw of asList(value)) {
    const candidate = read(raw);
    const match = allowed.find((item) => item === candidate);
    if (match !== undefined && !picked.includes(match)) picked.push(match);
  }
  return picked;
}

function isCategory(value: string): value is ShopCategory {
  return SHOP_CATEGORIES.some((category) => category.key === value);
}

export function serviceTypesOf(category: ShopCategory) {
  return SERVICE_TYPES_BY_CATEGORY[category];
}

const PRICE_KEYS = PRICE_FILTER_RANGES.map((range) => range.key);
const TIME_KEYS = TIME_FILTER_RANGES.map((range) => range.key);

/** 주소창 값을 읽는다. 목록에 없는 값과 고른 업종에 없는 서비스 종류는 버린다 */
export function parseFilters(params: Record<string, SearchValue>): HomeFilters {
  const rawCategory = asList(params[FILTER_PARAMS.category])[0];
  const category = rawCategory && isCategory(rawCategory) ? rawCategory : null;
  const services = category
    ? pickAllowed<ServiceType>(
        params[FILTER_PARAMS.service],
        serviceTypesOf(category).map((type) => type.key),
      )
    : [];
  return {
    category,
    services,
    prices: pickAllowed(params[FILTER_PARAMS.price], PRICE_KEYS),
    times: pickAllowed(params[FILTER_PARAMS.time], TIME_KEYS),
    // 할인율은 하나만. 여러 개가 오면 첫 번째 맞는 값
    minDiscount:
      pickAllowed(params[FILTER_PARAMS.discount], DISCOUNT_RATE_OPTIONS, (raw) =>
        /^\d+$/.test(raw) ? Number(raw) : raw,
      )[0] ?? null,
  };
}

/** 필터를 주소창 값으로 바꾼다. 필터가 아닌 다른 값은 그대로 둔다 */
export function applyFiltersToSearch(
  current: URLSearchParams,
  filters: HomeFilters,
): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const param of Object.values(FILTER_PARAMS)) next.delete(param);
  if (filters.category) {
    next.set(FILTER_PARAMS.category, filters.category);
    for (const service of filters.services) next.append(FILTER_PARAMS.service, service);
  }
  for (const price of filters.prices) next.append(FILTER_PARAMS.price, price);
  for (const time of filters.times) next.append(FILTER_PARAMS.time, time);
  if (filters.minDiscount !== null) next.set(FILTER_PARAMS.discount, String(filters.minDiscount));
  return next;
}

/** 업종을 바꾸면 서비스 종류 선택은 비운다(업종마다 목록이 달라서) */
export function selectCategory(filters: HomeFilters, category: ShopCategory | null): HomeFilters {
  return filters.category === category ? filters : { ...filters, category, services: [] };
}

function toggle<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((value) => value !== item) : [...list, item];
}

export function toggleService(filters: HomeFilters, service: ServiceType): HomeFilters {
  return { ...filters, services: toggle(filters.services, service) };
}

export function togglePrice(filters: HomeFilters, price: PriceRangeKey): HomeFilters {
  return { ...filters, prices: toggle(filters.prices, price) };
}

export function toggleTime(filters: HomeFilters, time: TimeRangeKey): HomeFilters {
  return { ...filters, times: toggle(filters.times, time) };
}

/** 최소 할인율을 고른다. null이면 전체 */
export function selectMinDiscount(
  filters: HomeFilters,
  minDiscount: DiscountRate | null,
): HomeFilters {
  return { ...filters, minDiscount };
}

/** 필터 버튼에 보여줄 고른 개수(업종 1 + 고른 버튼 수 + 할인율 1) */
export function countActiveFilters(filters: HomeFilters): number {
  return (
    (filters.category ? 1 : 0) +
    filters.services.length +
    filters.prices.length +
    filters.times.length +
    (filters.minDiscount !== null ? 1 : 0)
  );
}
