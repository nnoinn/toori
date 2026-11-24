// 회원 탈퇴 막는 이유 계산 (#154 본문 1장)과 되살리기 기한

import { describe, expect, it } from 'vitest';

import {
  type CustomerWithdrawalFacts,
  customerWithdrawalBlockers,
  type OwnerWithdrawalFacts,
  ownerWithdrawalBlockers,
  restorableUntil,
} from './withdrawal-rules';

const NONE_CUSTOMER: CustomerWithdrawalFacts = {
  upcomingReservations: 0,
  visitPendingReservations: 0,
  openDisputes: 0,
  unusedCoupons: 0,
  holding: false,
};

const NONE_OWNER: OwnerWithdrawalFacts = {
  upcomingReservations: 0,
  heldByCustomer: 0,
  visitPendingReservations: 0,
  openDisputes: 0,
  unpaidSettlement: null,
  outstandingPenalty: 0,
  openSlotCount: 0,
};

describe('고객 탈퇴를 막는 이유', () => {
  it('막는 것이 없으면 빈 목록(안 쓴 쿠폰과 결제 중은 막지 않는다)', () => {
    expect(
      customerWithdrawalBlockers({ ...NONE_CUSTOMER, unusedCoupons: 2, holding: true }),
    ).toEqual([]);
  });

  it('이용 예정 예약 → 방문 확인 중 → 이의제기 순서로 모두 준다', () => {
    expect(
      customerWithdrawalBlockers({
        ...NONE_CUSTOMER,
        upcomingReservations: 2,
        visitPendingReservations: 1,
        openDisputes: 3,
      }),
    ).toEqual([
      { code: 'UPCOMING_RESERVATION', count: 2 },
      { code: 'VISIT_PENDING', count: 1 },
      { code: 'OPEN_DISPUTE', count: 3 },
    ]);
  });
});

describe('원장님 탈퇴를 막는 이유', () => {
  it('막는 것이 없으면 빈 목록(판매 전 매물은 막지 않고 일괄 마감한다)', () => {
    expect(ownerWithdrawalBlockers({ ...NONE_OWNER, openSlotCount: 5 })).toEqual([]);
  });

  it('예약된 매물 → 손님 결제 중 → 방문 확인 중 → 이의제기 → 미지급 정산금 → 미수 패널티 순서로 모두 준다', () => {
    expect(
      ownerWithdrawalBlockers({
        upcomingReservations: 1,
        heldByCustomer: 2,
        visitPendingReservations: 3,
        openDisputes: 1,
        unpaidSettlement: { nextPayoutDate: '2026-11-26' },
        outstandingPenalty: 5000,
        openSlotCount: 4,
      }),
    ).toEqual([
      { code: 'UPCOMING_RESERVATION', count: 1 },
      { code: 'HELD_BY_CUSTOMER', count: 2 },
      { code: 'VISIT_PENDING', count: 3 },
      { code: 'OPEN_DISPUTE', count: 1 },
      { code: 'UNPAID_SETTLEMENT', nextPayoutDate: '2026-11-26' },
      { code: 'UNPAID_PENALTY', amount: 5000 },
    ]);
  });

  it('지급일이 정해지지 않은 미지급 정산금(보류 중)도 막는다', () => {
    expect(
      ownerWithdrawalBlockers({ ...NONE_OWNER, unpaidSettlement: { nextPayoutDate: null } }),
    ).toEqual([{ code: 'UNPAID_SETTLEMENT', nextPayoutDate: null }]);
  });
});

describe('되살리기 기한', () => {
  it('탈퇴한 시각부터 30일 뒤까지', () => {
    expect(restorableUntil(new Date('2026-11-23T03:00:00.000Z'), 30)).toEqual(
      new Date('2026-12-23T03:00:00.000Z'),
    );
  });
});
