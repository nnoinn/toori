// 운영자 예약 정보의 원장님 사정 취소 칸(#373 ③-2). 원장님 취소와 같은 판단으로 버튼·금액·막는 이유를 고르는지 본다.

import { describe, expect, it } from 'vitest';

import { OWNER_FAULT_COUPON_AMOUNT, OWNER_FAULT_PENALTY_AMOUNT } from '@/server/policy/owner-fault';
import type { RefundTarget } from '@/server/refunds/refund-store';

import { ownerFaultPanel } from './owner-fault-panel';

const START = new Date('2026-11-17T06:00:00.000Z');
const NOW = new Date('2026-11-16T06:00:00.000Z');

const TARGET: RefundTarget = {
  reservationId: 'r-1',
  orderId: 'order-1',
  slotId: 'slot-1',
  paymentId: 'toori-1',
  status: 'confirmed',
  paidAmount: 42_000,
  salePrice: 45_000,
  couponAmount: 3_000,
  startAt: START,
  requested: null,
};

const requested = (reason: 'owner_fault' | 'customer_cancel') => ({
  reason,
  band: null,
  penaltyRate: 0,
  refundAmount: 42_000,
  penaltyAmount: 0,
  requestedAt: NOW,
});

describe('ownerFaultPanel', () => {
  it('시작 전 예정 예약이면 대신 취소할 수 있고 원장님 취소와 같은 금액을 보여 준다', () => {
    expect(ownerFaultPanel(TARGET, NOW)).toEqual({
      kind: 'can_cancel',
      resuming: false,
      preview: {
        reservationId: 'r-1',
        cancellable: true,
        paidAmount: 42_000,
        refundAmount: 42_000,
        usedCouponAmount: 3_000,
        compensationCouponAmount: OWNER_FAULT_COUPON_AMOUNT,
        penaltyAmount: OWNER_FAULT_PENALTY_AMOUNT,
        startAt: START.toISOString(),
        serverNow: NOW.toISOString(),
      },
    });
  });

  it('딱 시작 시각부터는 ALREADY_STARTED, 다른 취소가 진행 중이면 CANCEL_FINISHING', () => {
    expect(ownerFaultPanel(TARGET, START)).toEqual({ kind: 'blocked', code: 'ALREADY_STARTED' });
    expect(ownerFaultPanel({ ...TARGET, requested: requested('customer_cancel') }, NOW)).toEqual({
      kind: 'blocked',
      code: 'CANCEL_FINISHING',
    });
  });

  it('진행 중인 원장님 사정 취소는 시작 시각이 지났어도 이어서 할 수 있다', () => {
    const later = new Date(START.getTime() + 60_000);
    expect(
      ownerFaultPanel({ ...TARGET, requested: requested('owner_fault') }, later),
    ).toMatchObject({ kind: 'can_cancel', resuming: true });
  });

  it('취소·방문·노쇼 처리된 예약은 칸을 보여 주지 않는다', () => {
    expect(ownerFaultPanel({ ...TARGET, status: 'cancelled' }, NOW)).toEqual({ kind: 'none' });
    expect(ownerFaultPanel({ ...TARGET, status: 'completed' }, NOW)).toEqual({ kind: 'none' });
  });
});
