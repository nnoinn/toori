// 매물 목록 정렬 (J4, C-205). 주소창 ?sort= 에 key로 둔다. 정렬은 DB에서 한다(#19 J4).

export const SLOT_SORTS = [
  { key: 'near', label: '거리순' },
  { key: 'discount', label: '할인율순' },
  { key: 'imminent', label: '임박순' },
] as const;

export type SlotSort = (typeof SLOT_SORTS)[number]['key'];

/** 기본은 거리순(C-205) */
export const DEFAULT_SORT: SlotSort = 'near';

export const SORT_PARAM = 'sort';

export function parseSort(value: string | string[] | undefined): SlotSort {
  const raw = Array.isArray(value) ? value[0] : value;
  return SLOT_SORTS.some((sort) => sort.key === raw) ? (raw as SlotSort) : DEFAULT_SORT;
}

/** 정렬을 주소창 값으로. 기본값이면 주소를 짧게 두려고 지운다. 다른 값은 그대로 둔다 */
export function applySortToSearch(current: URLSearchParams, sort: SlotSort): URLSearchParams {
  const next = new URLSearchParams(current);
  if (sort === DEFAULT_SORT) next.delete(SORT_PARAM);
  else next.set(SORT_PARAM, sort);
  return next;
}
