// 매물·예약 조회 화면 표시 모양 (A-103, W18).

import { type SlotCloseReason, SLOT_STATUSES, type SlotStatus } from '@/db/schema/slots';
import {
  getSlotStatus,
  isSlotOnHold,
  type SlotHoldInput,
  type SlotStatusInput,
} from '@/features/slot-status/slot-status';
import type { WindowState } from '@/server/slot-windows/types';

/** 목록 탭. 주소 ?tab= 값. windows는 시간대 매물(#567) */
export const LOOKUP_TABS = ['reservations', 'slots', 'windows'] as const;
export type LookupTab = (typeof LOOKUP_TABS)[number];

export function toLookupTab(value: string | undefined): LookupTab {
  return LOOKUP_TABS.find((tab) => tab === value) ?? 'reservations';
}

/** 예약 목록 거르기. 주소 ?status= 값. review는 운영자가 확인해야 하는 예약이다 */
export const RESERVATION_FILTERS = [
  'all',
  'confirmed',
  'completed',
  'no_show',
  'cancelled',
  'review',
] as const;
export type ReservationFilter = (typeof RESERVATION_FILTERS)[number];

export function toReservationFilter(value: string | undefined): ReservationFilter {
  return RESERVATION_FILTERS.find((filter) => filter === value) ?? 'all';
}

export const RESERVATION_FILTER_LABELS: Record<ReservationFilter, string> = {
  all: '전체',
  confirmed: '예정',
  completed: '이용 완료',
  no_show: '노쇼',
  cancelled: '취소',
  review: '확인 필요',
};

/**
 * 예약 목록 정렬. 주소 ?sort= 값(#360 1번). 첫 칸이 예약한 시각이라 기본은 최근에 예약한 것부터다.
 * 서비스 일시로도 고를 수 있다
 */
export const RESERVATION_SORTS = ['latest', 'oldest', 'start_soon', 'start_late'] as const;
export type ReservationSort = (typeof RESERVATION_SORTS)[number];

export function toReservationSort(value: string | undefined): ReservationSort {
  return RESERVATION_SORTS.find((sort) => sort === value) ?? 'latest';
}

export const RESERVATION_SORT_LABELS: Record<ReservationSort, string> = {
  latest: '최신 예약 순',
  oldest: '오래된 예약 순',
  start_soon: '서비스 일시 빠른 순',
  start_late: '서비스 일시 늦은 순',
};

/** 매물 목록 거르기. 주소 ?status= 값 */
export type SlotFilter = 'all' | SlotStatus;
export const SLOT_FILTERS: readonly SlotFilter[] = ['all', ...SLOT_STATUSES];

export function toSlotFilter(value: string | undefined): SlotFilter {
  return SLOT_FILTERS.find((filter) => filter === value) ?? 'all';
}

/**
 * 시간대 매물 목록 거르기(#567). 주소 ?status= 값. 지금 시각으로 나눈다:
 * 게시예정(게시 시각 전), 게시중(게시 시각이 지났고 끝나지 않음, 다 찬 시간대 포함), 마감(마감했거나 끝남)
 */
export const WINDOW_FILTERS = ['all', 'scheduled', 'published', 'closed'] as const;
export type WindowFilter = (typeof WINDOW_FILTERS)[number];

export function toWindowFilter(value: string | undefined): WindowFilter {
  return WINDOW_FILTERS.find((filter) => filter === value) ?? 'all';
}

export const WINDOW_FILTER_LABELS: Record<WindowFilter, string> = {
  all: '전체',
  scheduled: '게시예정',
  published: '게시중',
  closed: '마감',
};

/** 시간대 매물 한 줄의 상태 이름. 다 참은 게시중인데 남은 시간에 들어가는 서비스가 없는 것(windowStatus) */
export const WINDOW_STATE_LABELS: Record<WindowState, string> = {
  scheduled: '게시예정',
  published: '게시중',
  full: '다 참',
  closed: '마감',
};

/** 운영자가 강제 마감할 수 있는 시간대 매물(#373 ④): 마감하지 않았고 끝나지 않음. 막는 것은 서버가 다시 본다 */
export function canForceCloseWindow(state: WindowState): boolean {
  return state !== 'full';
}

/** 목록 주소. 기본값은 주소에 넣지 않는다. 정렬은 예약 목록에만 있다 */
export function lookupHref(input: {
  tab: LookupTab;
  status?: string;
  query?: string;
  sort?: ReservationSort;
}): string {
  const params = new URLSearchParams();
  if (input.tab !== 'reservations') params.set('tab', input.tab);
  if (input.status && input.status !== 'all') params.set('status', input.status);
  if (input.query) params.set('q', input.query);
  if (input.tab === 'reservations' && input.sort && input.sort !== 'latest') {
    params.set('sort', input.sort);
  }
  const search = params.toString();
  return search ? `/admin/reservations?${search}` : '/admin/reservations';
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: '결제 대기',
  paid: '결제 확인(자동 취소 전)',
  confirmed: '확정',
  failed: '실패',
  auto_cancelled: '자동 취소',
};

export function labelOrderStatus(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

const CANCEL_ACTOR_LABELS: Record<string, string> = {
  customer: '고객',
  owner_fault: '원장님 귀책',
  system: '자동',
  admin: '운영자',
  agreed: '합의 후 취소',
};

export function labelCancelActor(actor: string | null): string {
  if (!actor) return '-';
  return CANCEL_ACTOR_LABELS[actor] ?? actor;
}

const REFUND_REASON_LABELS: Record<string, string> = {
  customer_cancel: '고객 취소',
  owner_fault: '원장님 귀책',
  auto_cancel: '자동 취소',
  admin_exception: '운영자 예외',
  agreed_cancel: '합의 후 취소',
};

export function labelRefundReason(reason: string): string {
  return REFUND_REASON_LABELS[reason] ?? reason;
}

export function labelRefundStatus(status: string): string {
  return status === 'requested' ? '진행 중' : '끝남';
}

const REFUND_BAND_LABELS: Record<string, string> = {
  over_24h: '24시간 이상',
  '6h_to_24h': '6~24시간',
  under_6h: '6시간 미만',
};

export function labelRefundBand(band: string | null): string {
  if (!band) return '-';
  return REFUND_BAND_LABELS[band] ?? band;
}

/** 취소할 때 시작까지 남은 시간. 예: "30.5시간 전" */
export function labelHoursBefore(hours: number | null): string {
  if (hours === null) return '-';
  if (hours < 0) return `시작 ${(-hours).toFixed(1)}시간 뒤`;
  return `${hours.toFixed(1)}시간 전`;
}

/** 매물 상세 주소(11/19 운영자 화면 피드백). 매물·예약 메뉴 아래에 둬서 왼쪽 메뉴가 그대로 켜진다 */
export function slotDetailHref(slotId: string): string {
  return `/admin/reservations/slots/${slotId}`;
}

const SLOT_CLOSE_REASON_LABELS: Record<SlotCloseReason, string> = {
  other_channel: '다른 곳 예약',
  mistake: '잘못 올림',
  other: '기타',
  hold_released: '결제 없이 홀딩 끝남',
  admin: '운영자 마감',
};

/** 매물 마감 사유. 앞의 셋은 원장님이 고른 것이다(S-206) */
export function labelSlotCloseReason(reason: string | null): string {
  if (!reason) return '-';
  return SLOT_CLOSE_REASON_LABELS[reason as SlotCloseReason] ?? reason;
}

/** 매물을 올린 방식 */
export type SlotOrigin = 'single' | 'window' | 'relist';

export const SLOT_ORIGIN_LABELS: Record<SlotOrigin, string> = {
  single: '한 시술 매물',
  window: '시간대 매물에서 손님이 고른 칸',
  relist: '취소된 매물을 재등록',
};

/** 시간대 안에서 손님이 만든 칸이면 window, 취소된 매물을 다시 올린 것이면 relist, 아니면 single */
export function slotOrigin(slot: {
  windowId: string | null;
  relistedFromSlotId: string | null;
}): SlotOrigin {
  if (slot.windowId) return 'window';
  return slot.relistedFromSlotId ? 'relist' : 'single';
}

/**
 * 운영자가 강제 마감할 수 있는 매물(#373 ④): 지금 판매 전(게시예정·게시중)이고 손님이 결제 중이 아니며,
 * 시간대 안에서 손님이 만든 칸이 아님(그때는 그 시간대를 마감한다). 버튼을 보일지만 정하고, 막는 것은 서버가 다시 본다
 */
export function canForceCloseSlot(
  slot: SlotStatusInput & SlotHoldInput & { windowId: string | null },
  now: Date,
): boolean {
  const status = getSlotStatus(slot, now);
  return (
    (status === 'scheduled' || status === 'published') &&
    !isSlotOnHold(slot, now) &&
    slot.windowId === null
  );
}
