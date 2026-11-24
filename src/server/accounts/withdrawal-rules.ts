// 회원 탈퇴 막는 이유 계산 (#154 본문 1장). 계산만 한다(DB 없음). 화면과 서버 어디서나 가져올 수 있다.
// DB에서 센 값(withdrawal-store.ts)을 받아 막는 이유 목록을 정해 둔 순서로 만든다. 0이거나 없는 이유는 넣지 않는다

import type { WithdrawalBlocker } from './withdrawal-types';

/** 고객 계정에서 센 값 */
export type CustomerWithdrawalFacts = {
  /** 시작 전 예정 예약 수 */
  upcomingReservations: number;
  /** 시작이 지났는데 방문·노쇼 처리 전인 예약 수 */
  visitPendingReservations: number;
  /** 확인 중인 이의제기 수 */
  openDisputes: number;
  /** 안 쓰고 기한이 남은 쿠폰 수 */
  unusedCoupons: number;
  /** 지금 결제 중(10분 홀딩)인 매물이 있는지 */
  holding: boolean;
};

/** 원장님 샵에서 센 값 */
export type OwnerWithdrawalFacts = {
  /** 시작 전 예정 예약 수(예약된 매물) */
  upcomingReservations: number;
  /** 손님이 결제 중인 판매 전 매물 수 */
  heldByCustomer: number;
  visitPendingReservations: number;
  openDisputes: number;
  /** 아직 지급하지 않은 정산금(정산할 금액이 없는 줄은 빼고). 없으면 null */
  unpaidSettlement: { nextPayoutDate: string | null } | null;
  /** 못 걷은 원장님 사정 취소 패널티(원) */
  outstandingPenalty: number;
  /** 탈퇴할 때 일괄 마감할 판매 전 매물·시간대 수 */
  openSlotCount: number;
};

/** 고객: 이용 예정 예약 → 방문 확인 중 → 이의제기 순서 */
export function customerWithdrawalBlockers(facts: CustomerWithdrawalFacts): WithdrawalBlocker[] {
  const blockers: WithdrawalBlocker[] = [];
  if (facts.upcomingReservations > 0) {
    blockers.push({ code: 'UPCOMING_RESERVATION', count: facts.upcomingReservations });
  }
  if (facts.visitPendingReservations > 0) {
    blockers.push({ code: 'VISIT_PENDING', count: facts.visitPendingReservations });
  }
  if (facts.openDisputes > 0) blockers.push({ code: 'OPEN_DISPUTE', count: facts.openDisputes });
  return blockers;
}

/** 원장님: 예약된 매물 → 손님 결제 중 → 방문 확인 중 → 이의제기 → 미지급 정산금 → 미수 패널티 순서 */
export function ownerWithdrawalBlockers(facts: OwnerWithdrawalFacts): WithdrawalBlocker[] {
  const blockers: WithdrawalBlocker[] = [];
  if (facts.upcomingReservations > 0) {
    blockers.push({ code: 'UPCOMING_RESERVATION', count: facts.upcomingReservations });
  }
  if (facts.heldByCustomer > 0) {
    blockers.push({ code: 'HELD_BY_CUSTOMER', count: facts.heldByCustomer });
  }
  if (facts.visitPendingReservations > 0) {
    blockers.push({ code: 'VISIT_PENDING', count: facts.visitPendingReservations });
  }
  if (facts.openDisputes > 0) blockers.push({ code: 'OPEN_DISPUTE', count: facts.openDisputes });
  if (facts.unpaidSettlement) {
    blockers.push({
      code: 'UNPAID_SETTLEMENT',
      nextPayoutDate: facts.unpaidSettlement.nextPayoutDate,
    });
  }
  if (facts.outstandingPenalty > 0) {
    blockers.push({ code: 'UNPAID_PENALTY', amount: facts.outstandingPenalty });
  }
  return blockers;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 되살릴 수 있는 마지막 시각(이 시각 전까지) */
export function restorableUntil(withdrawnAt: Date, restoreDays: number): Date {
  return new Date(withdrawnAt.getTime() + restoreDays * DAY_MS);
}
