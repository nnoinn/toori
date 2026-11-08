import type { SlotStatus } from '@/features/slot-status/slot-status';

import type { ReservationView } from './reservations/reservation-detail';

// 원장님 화면 상태 배지 색(#23 디자인 A6). 대시보드(매물 상태)와 예약 상세(예약 상태)가 따로 적던 색을 여기 모은다.
// 같은 뜻이면 같은 색: 예약됨 = 예정, 완료 = 방문 완료, 취소 = 취소. 판매 중·예약은 눈에 띄게, 끝난 것은 흐리게.

const TONE = {
  /** 아직 판매 전(예약대기) */
  waiting: 'border-border bg-background text-foreground',
  /** 판매 중(게시중) */
  onSale: 'bg-primary/15 text-primary',
  /** 예약이 잡혀 있음(예약됨·예정) */
  booked: 'bg-accent text-accent-foreground',
  /** 원장님이 처리해야 함(방문 처리 필요) */
  needsAction: 'bg-warning/25 text-warning-foreground',
  /** 끝남(완료·방문 완료) */
  done: 'border-border bg-background text-muted-foreground',
  /** 팔리지 않음(마감·취소) */
  off: 'bg-muted text-muted-foreground',
  /** 노쇼 */
  noShow: 'bg-destructive/10 text-destructive',
} as const;

/** 대시보드 매물 상태 배지(X-301 이름 6개) */
export const SLOT_STATUS_STYLE: Record<SlotStatus, string> = {
  scheduled: TONE.waiting,
  published: TONE.onSale,
  reserved: TONE.booked,
  closed: TONE.off,
  cancelled: TONE.off,
  completed: TONE.done,
};

/** 예약 상세 예약 상태 배지 */
export const RESERVATION_VIEW_STYLE: Record<ReservationView, string> = {
  upcoming: TONE.booked,
  needsVisit: TONE.needsAction,
  visited: TONE.done,
  noShow: TONE.noShow,
  cancelled: TONE.off,
};
