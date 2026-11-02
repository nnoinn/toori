// 원장님 예약 상세 규칙 (O11, S-403). 서버와 화면이 같이 쓴다.
// 예약자 연락처는 방문·노쇼를 처리했거나 취소된 예약이면 뒷자리만 보여준다(#21 Q11).
// 샵에 연락처를 주는 기간이 "예약한 서비스 이용이 끝날 때까지"라서다(동의 문구 3-1).
// 방문 완료·노쇼 처리(O14, S-405)는 누른 뒤 확인 창에서 한 번 더 눌러야 하고, 처리한 뒤에는 바꿀 수 없다(#130).

import type { CancelActor, ReservationStatus, VisitResult } from '@/db/schema';
import type { VisitErrorCode } from '@/server/visits/errors';
import { canRecordVisit } from '@/server/visits/rules';

export type ReservationView = 'upcoming' | 'needsVisit' | 'visited' | 'noShow' | 'cancelled';

export const RESERVATION_VIEW_LABELS: Record<ReservationView, string> = {
  upcoming: '예정',
  needsVisit: '방문 처리 필요',
  visited: '방문 완료',
  noShow: '노쇼',
  cancelled: '취소',
};

export const CANCEL_ACTOR_LABELS: Record<CancelActor, string> = {
  customer: '고객 취소',
  owner_fault: '원장님 사정으로 취소',
  system: '자동 취소',
  admin: '운영자 취소',
};

export type ReservationViewInput = {
  status: ReservationStatus;
  visitResult: VisitResult | null;
  /** 매물(서비스) 시작 시각 */
  startAt: Date;
};

/** 화면에 보여줄 예약 상태. 시작이 지났는데 처리하지 않았으면 방문 처리 필요(O14 버튼과 같은 기준) */
export function reservationView(reservation: ReservationViewInput, now: Date): ReservationView {
  if (reservation.status === 'cancelled') return 'cancelled';
  if (reservation.visitResult === 'no_show') return 'noShow';
  if (reservation.visitResult === 'visited' || reservation.status === 'completed') return 'visited';
  return canRecordVisit(reservation, now) ? 'needsVisit' : 'upcoming';
}

/** 연락처를 다 보여줄지: 취소되지 않았고 방문·노쇼를 아직 처리하지 않은 예약만 */
export function showsFullPhone(reservation: ReservationViewInput): boolean {
  return reservation.status === 'confirmed' && reservation.visitResult === null;
}

/** 휴대폰 번호 가운데를 가린다. 예: "010-1234-5678" → "010-****-5678" */
export function maskPhone(phone: string): string {
  const parts = phone.split('-');
  if (parts.length === 3) return [parts[0], '*'.repeat(parts[1].length), parts[2]].join('-');
  return `****${phone.slice(-4)}`;
}

/** 방문 완료·노쇼 버튼과 확인 창 문구(10/29 nnoinn, #130) */
export const VISIT_ACTIONS: Record<
  VisitResult,
  { button: string; title: string; consequence: string | null; confirm: string }
> = {
  visited: {
    button: '방문 완료',
    title: '방문 완료로 처리할까요?',
    consequence: null,
    confirm: '방문 완료로 처리',
  },
  no_show: {
    button: '노쇼',
    title: '노쇼로 처리할까요?',
    // 노쇼는 위약금 100%라 결제 금액이 정산에 들어간다(S-406)
    consequence: '결제 금액은 고객에게 환불되지 않고 정산에 들어가요.',
    confirm: '노쇼로 처리',
  },
};

/** 처리가 막혔을 때 화면을 지금 상태로 다시 받을지: 그 사이 다른 곳에서 처리했거나 예약이 취소된 경우 */
export function visitFailShowsNewState(code: string): boolean {
  const stale: VisitErrorCode[] = ['ALREADY_RECORDED', 'NOT_RESERVED'];
  return (stale as string[]).includes(code);
}
