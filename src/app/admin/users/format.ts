// 회원 조회 화면 표시 모양 (A-102, W18).

/** 목록 탭. 주소 ?tab= 값 */
export const USER_TABS = ['customers', 'owners'] as const;
export type UserTab = (typeof USER_TABS)[number];

export function toUserTab(value: string | undefined): UserTab {
  return USER_TABS.find((tab) => tab === value) ?? 'customers';
}

/** 회원 목록 정렬. 주소 ?sort= 값(#360 1번). 기본은 최근 가입부터 */
export const USER_SORTS = ['latest', 'oldest', 'name'] as const;
export type UserSort = (typeof USER_SORTS)[number];

export const USER_SORT_LABELS: Record<UserSort, string> = {
  latest: '최신 가입 순',
  oldest: '오래된 가입 순',
  name: '가나다 순',
};

export function toUserSort(value: string | undefined): UserSort {
  return USER_SORTS.find((sort) => sort === value) ?? 'latest';
}

/** 회원 목록 주소. 검색어와 정렬(기본 정렬은 빼고)을 지킨다 */
export function usersHref(input: { tab: UserTab; query?: string; sort?: UserSort }): string {
  const params = new URLSearchParams({ tab: input.tab });
  if (input.query) params.set('q', input.query);
  if (input.sort && input.sort !== 'latest') params.set('sort', input.sort);
  return `/admin/users?${params.toString()}`;
}
