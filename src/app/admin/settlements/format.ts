// 운영자 정산 관리 화면 표시 모양 (A-105, W20 ④). 화면 코드에서만 쓰는 이름 바꾸기·주소 만들기라 이 폴더에 둔다.

import { z } from 'zod';

import type { SettlementStatus } from '@/db/schema/settlements';
import type { SettlementItemViewKind, SettlementStatementStatus } from '@/server/settlements/types';

/** 목록 탭. 주소 ?status= 값. 기본은 지급 전(지급 요청 전에 확인할 것) */
export const SETTLEMENT_FILTERS = ['pending', 'requested', 'paid', 'failed', 'all'] as const;
export type SettlementFilter = (typeof SETTLEMENT_FILTERS)[number];

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  pending: '지급 전',
  requested: '지급 요청',
  paid: '지급 완료',
  failed: '지급 실패',
};

/** 정산서 상태 이름. 지급 예정(scheduled)은 아직 목요일에 묶이지 않은 장이다 */
export const STATEMENT_STATUS_LABELS: Record<SettlementStatementStatus, string> = {
  scheduled: '지급 예정',
  ...SETTLEMENT_STATUS_LABELS,
};

/** 지급 예정 정산서의 뗄 패널티·실지급액에 붙이는 표시(11/14 nnoinn, 묶기 전에 바뀔 수 있다) */
export const ESTIMATE_MARK = '(예상)';

export const SETTLEMENT_FILTER_LABELS: Record<SettlementFilter, string> = {
  ...SETTLEMENT_STATUS_LABELS,
  all: '전체',
};

/** 목록 정렬. 주소 ?sort= 값(#360 1번 정렬 고르기) */
export const SETTLEMENT_SORTS = ['payout_old', 'payout_new', 'amount_high'] as const;
export type SettlementSort = (typeof SETTLEMENT_SORTS)[number];

export const SETTLEMENT_SORT_LABELS: Record<SettlementSort, string> = {
  payout_old: '지급일 이른 순',
  payout_new: '지급일 최근 순',
  amount_high: '실지급액 큰 순',
};

/** 거래 종류 이름. 원장님 정산 화면(S-502)과 같은 이름 */
export const SETTLEMENT_KIND_LABELS: Record<SettlementItemViewKind, string> = {
  sale: '이용 완료',
  no_show: '노쇼',
  penalty: '고객 취소',
  agreed_cancel: '합의 후 취소',
  owner_cancel: '원장님 사정 취소',
  void: '무효',
};

/** 0원 정산의 이유 */
export const ZERO_REASON_LABELS = { penalty_offset: '패널티로 상계해서 0원' } as const;

/**
 * 탭마다 기본 정렬. 아직 끝나지 않은 것(지급 전·요청·실패)은 오래된 지급일부터 처리하고,
 * 지급 완료·전체는 최근 지급일부터 본다
 */
export function defaultSettlementSort(filter: SettlementFilter): SettlementSort {
  return filter === 'paid' || filter === 'all' ? 'payout_new' : 'payout_old';
}

/** 주소의 탭 값. 없거나 모르는 값이면 지급 전 */
export function toSettlementFilter(value: string | undefined): SettlementFilter {
  return SETTLEMENT_FILTERS.find((filter) => filter === value) ?? 'pending';
}

/** 주소의 정렬 값. 없거나 모르는 값이면 null(그 탭의 기본 정렬) */
export function toSettlementSort(value: string | undefined): SettlementSort | null {
  return SETTLEMENT_SORTS.find((sort) => sort === value) ?? null;
}

const dateSchema = z.iso.date();

/** 주소의 지급일 값('YYYY-MM-DD'). 모양이 틀리면 null(거르지 않는다) */
export function toPayoutDate(value: string | undefined): string | null {
  const parsed = dateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export type SettlementListParams = {
  filter: SettlementFilter;
  sort?: SettlementSort | null;
  query?: string;
  from?: string | null;
  to?: string | null;
};

/** 정산 목록 주소. 기본값(지급 전 탭, 그 탭의 기본 정렬, 빈 검색어·기간)은 주소에 넣지 않는다 */
export function settlementsHref(input: SettlementListParams): string {
  const params = new URLSearchParams();
  if (input.filter !== 'pending') params.set('status', input.filter);
  if (input.sort && input.sort !== defaultSettlementSort(input.filter)) {
    params.set('sort', input.sort);
  }
  if (input.query) params.set('q', input.query);
  if (input.from) params.set('from', input.from);
  if (input.to) params.set('to', input.to);
  const search = params.toString();
  return search ? `/admin/settlements?${search}` : '/admin/settlements';
}

/** 샵별 정산서 목록 주소 */
export function shopStatementsHref(shopId: string): string {
  return `/admin/settlements/shops/${shopId}`;
}

/**
 * 정산서 한 장 주소. 묶인 정산서는 정산 묶음 id로(운영자 칸까지 보이는 화면),
 * 아직 묶이지 않은 지급 예정 정산서는 샵·지급일로 연다
 */
export function statementHref(input: {
  shopId: string;
  payoutDate: string;
  settlementId?: string | null;
}): string {
  return input.settlementId
    ? `/admin/settlements/${input.settlementId}`
    : `${shopStatementsHref(input.shopId)}/${input.payoutDate}`;
}
