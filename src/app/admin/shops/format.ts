// 입점 심사 화면 표시 모양 (A-101). 화면 코드에서만 쓰는 이름 바꾸기라 이 폴더에 둔다.

import type { PgSellerStatus } from '@/db/schema/shops';

import type { ReviewFilter } from './queries';

/** 입점 심사 목록 정렬. 주소 ?sort= 값(#360 1번) */
export const SHOP_SORTS = ['applied_old', 'applied_new', 'reviewed_new'] as const;
export type ShopSort = (typeof SHOP_SORTS)[number];

export const SHOP_SORT_LABELS: Record<ShopSort, string> = {
  applied_old: '오래된 신청 순',
  applied_new: '최신 신청 순',
  reviewed_new: '최신 심사 순',
};

/**
 * 거르기마다 기본 정렬. 승인 대기는 먼저 신청한 샵부터 차례로 심사하고, 전체는 최근 신청부터,
 * 승인·반려는 최근에 심사한 것부터 본다(정렬 고르기 전과 같은 순서)
 */
export function defaultShopSort(filter: ReviewFilter): ShopSort {
  if (filter === 'pending') return 'applied_old';
  if (filter === 'all') return 'applied_new';
  return 'reviewed_new';
}

/** 주소의 정렬 값. 없거나 모르는 값이면 null(그 거르기의 기본 정렬을 쓴다) */
export function toShopSort(value: string | undefined): ShopSort | null {
  return SHOP_SORTS.find((sort) => sort === value) ?? null;
}

/** 입점 심사 목록 주소. 기본 거르기(승인 대기)와 그 거르기의 기본 정렬은 주소에 넣지 않는다 */
export function shopsHref(input: { filter: ReviewFilter; sort?: ShopSort | null }): string {
  const params = new URLSearchParams();
  if (input.filter !== 'pending') params.set('status', input.filter);
  if (input.sort && input.sort !== defaultShopSort(input.filter)) params.set('sort', input.sort);
  const search = params.toString();
  return search ? `/admin/shops?${search}` : '/admin/shops';
}

// 사업자등록번호 모양(formatBusinessNumber)은 원장님 화면과 같이 쓰려고 '@/lib/business-number'로 옮겼다(#205, #213)

const PG_SELLER_STATUS_LABELS: Record<PgSellerStatus, string> = {
  not_registered: '등록 전',
  requested: '등록 요청함',
  approved: '등록됨',
  rejected: '등록 거절',
};

/** PG 지급대행 셀러 등록 상태(W20에서 등록) */
export function labelPgSellerStatus(status: string): string {
  return PG_SELLER_STATUS_LABELS[status as PgSellerStatus] ?? status;
}

const REVIEW_ACTION_LABELS: Record<string, string> = {
  'shop.approve': '승인',
  'shop.reject': '반려',
};

/** 운영자 작업 기록(admin_actions.action)의 화면 이름 */
export function labelReviewAction(action: string): string {
  return REVIEW_ACTION_LABELS[action] ?? action;
}
