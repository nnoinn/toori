// 입점 심사 화면 표시 모양 (A-101). 화면 코드에서만 쓰는 이름 바꾸기라 이 폴더에 둔다.

import type { AgreedCancelRequestStatus } from '@/db/schema/refunds';
import type { PgSellerStatus } from '@/db/schema/shops';
import { formatKstDateTime } from '@/lib/time';
import {
  AGREED_CANCEL_REASON_LABELS,
  type AgreedCancelReason,
} from '@/server/refunds/agreed-cancel-types';

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

/** 합의 후 취소 요청의 결과 이름(운영자 샵 상세 '취소 기록', 예약 상세 '합의 후 취소 요청') */
export const AGREED_REQUEST_STATUS_LABELS: Record<AgreedCancelRequestStatus, string> = {
  requested: '손님 답 기다림',
  agreed: '손님 동의(취소됨)',
  declined: '손님 거절',
  expired: '24시간 안에 답이 없어 끝남',
  closed: '답하기 전에 끝남',
};

/**
 * 합의 후 취소 사유 표시(운영자 샵 상세 '취소 기록', 예약 상세 '합의 후 취소 요청').
 * 기타면 원장님이 적은 내용을 괄호로 붙인다. 예: "기타(손님이 일정이 바뀌었대요)"
 */
export function agreedCancelReasonText(
  reason: AgreedCancelReason,
  reasonText: string | null,
): string {
  const label = AGREED_CANCEL_REASON_LABELS[reason];
  return reason === 'other' && reasonText ? `${label}(${reasonText})` : label;
}

/**
 * 입점 심사의 국세청 진위확인 결과(#208). 맞음·확인 못 함은 확인한 시각을 붙인다.
 * 비어 있으면 확인 안 함(국세청 키가 없는 개발 환경에서 신청했거나 이 기능 전에 신청한 샵)
 */
export function ntsCheckText(check: string | null, checkedAt: Date | null): string {
  const at = checkedAt ? ` · ${formatKstDateTime(checkedAt)} 확인` : '';
  if (check === 'verified') return `국세청 정보와 맞음${at}`;
  if (check === 'unavailable') return `확인 못 함(국세청이 응답하지 않았어요)${at}`;
  return '확인 안 함';
}
