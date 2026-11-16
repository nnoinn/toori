// 원장님 귀책 취소 (S-409, X-207, #419). 권한·내 샵 예약만·막는 조건(취소됨·시작 뒤·다른 취소 진행 중)·미리보기 금액과,
// 환불 진행에 넘기는 값(결제액 전부, 원장님 사정 사유)을 본다. 로그인·DB·시각과 환불 진행(cancel-flow, cancel.test.ts가 본다)은 가짜로 바꾼다.
// 쿠폰·패널티 저장은 owner-fault-store.db.test.ts, 마무리·알림은 finish-cancel.test.ts가 본다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';
import { OWNER_FAULT_COUPON_AMOUNT, OWNER_FAULT_PENALTY_AMOUNT } from '@/server/policy/owner-fault';

import type { RefundTarget } from './refund-store';

const RESERVATION = '5d6e7f80-9a1b-4c2d-8e3f-405162738495';
const START = new Date('2026-11-17T06:00:00.000Z');
const NOW = new Date('2026-11-16T06:00:00.000Z');

const state = vi.hoisted(() => ({
  auth: null as unknown,
  now: new Date(),
  target: null as unknown,
  reads: [] as unknown[],
  flows: [] as unknown[],
  flowResult: null as unknown,
}));

vi.mock('@/lib/request-time', () => ({ getRequestNow: async () => state.now }));
vi.mock('@/server/auth', () => ({ requireOwner: async () => state.auth }));
vi.mock('@/db', () => ({ getDb: () => 'db' }));
vi.mock('./refund-store', () => ({
  readRefundTargetForShop: async (reservationId: string, shopId: string) => {
    state.reads.push([reservationId, shopId]);
    return state.target;
  },
}));
vi.mock('./cancel-flow', () => ({
  runCancelRefund: async (db: unknown, input: unknown) => {
    state.flows.push({ db, input });
    return state.flowResult;
  },
}));

const { cancelByOwnerFault, previewOwnerFaultCancel } = await import('./owner-fault-cancel');

const TARGET: RefundTarget = {
  voidInProgress: false,
  reservationId: RESERVATION,
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

beforeEach(() => {
  state.auth = ok({ userId: 'owner-user', ownerId: 'owner-1', shopId: 'shop-1' });
  state.now = NOW;
  state.target = TARGET;
  state.reads = [];
  state.flows = [];
  state.flowResult = ok({
    reservationId: RESERVATION,
    refundAmount: 42_000,
    cancelledAt: NOW.toISOString(),
  });
});

describe('previewOwnerFaultCancel', () => {
  it('내 샵 예약이면 결제액 전부 환불, 쓴 쿠폰, 보상 쿠폰 3,000원, 패널티 5,000원을 보여준다', async () => {
    expect(await previewOwnerFaultCancel(RESERVATION)).toEqual(
      ok({
        reservationId: RESERVATION,
        cancellable: true,
        paidAmount: 42_000,
        refundAmount: 42_000,
        usedCouponAmount: 3_000,
        compensationCouponAmount: OWNER_FAULT_COUPON_AMOUNT,
        penaltyAmount: OWNER_FAULT_PENALTY_AMOUNT,
        startAt: START.toISOString(),
        serverNow: NOW.toISOString(),
      }),
    );
    expect(OWNER_FAULT_COUPON_AMOUNT).toBe(3_000);
    expect(OWNER_FAULT_PENALTY_AMOUNT).toBe(5_000);
    expect(state.reads).toEqual([[RESERVATION, 'shop-1']]);
  });

  it('서비스 시작 시각부터(딱 그 시각 포함)와 방문·노쇼 처리된 예약은 취소할 수 없다', async () => {
    state.now = new Date(START.getTime() - 1);
    expect(await previewOwnerFaultCancel(RESERVATION)).toMatchObject({
      data: { cancellable: true },
    });
    state.now = START;
    expect(await previewOwnerFaultCancel(RESERVATION)).toMatchObject({
      data: { cancellable: false },
    });
    state.now = NOW;
    state.target = { ...TARGET, status: 'completed' };
    expect(await previewOwnerFaultCancel(RESERVATION)).toMatchObject({
      data: { cancellable: false },
    });
  });

  it('없거나 남의 샵 예약·모양이 틀린 id는 RESERVATION_NOT_FOUND, 취소된 예약은 ALREADY_CANCELLED, 원장님이 아니면 그 실패', async () => {
    state.target = null;
    expect(await previewOwnerFaultCancel(RESERVATION)).toMatchObject({
      error: { code: 'RESERVATION_NOT_FOUND' },
    });
    expect(await previewOwnerFaultCancel('x')).toMatchObject({
      error: { code: 'RESERVATION_NOT_FOUND' },
    });
    state.target = { ...TARGET, status: 'cancelled' };
    expect(await previewOwnerFaultCancel(RESERVATION)).toMatchObject({
      error: { code: 'ALREADY_CANCELLED' },
    });
    state.auth = fail('WRONG_MODE', '원장님 계정으로 들어와 주세요');
    expect(await previewOwnerFaultCancel(RESERVATION)).toMatchObject({
      error: { code: 'WRONG_MODE' },
    });
  });
});

describe('cancelByOwnerFault', () => {
  it('결제액 전부를 원장님 사정 사유로 환불 진행에 넘기고 그 결과를 돌려준다', async () => {
    expect(await cancelByOwnerFault({ reservationId: RESERVATION })).toEqual(state.flowResult);
    expect(state.flows).toEqual([
      {
        db: 'db',
        input: {
          target: TARGET,
          requested: {
            reason: 'owner_fault',
            band: null,
            penaltyRate: 0,
            refundAmount: 42_000,
            penaltyAmount: 0,
            requestedAt: NOW,
          },
          now: NOW,
          pgReason: '원장님 사정 취소',
        },
      },
    ]);
  });

  it.each([
    ['서비스 시작 뒤', { startAt: new Date(NOW.getTime() - 1) }, 'ALREADY_STARTED'],
    ['딱 시작 시각', { startAt: NOW }, 'ALREADY_STARTED'],
    ['방문·노쇼 처리됨', { status: 'completed' as const }, 'ALREADY_STARTED'],
    ['이미 취소됨', { status: 'cancelled' as const }, 'ALREADY_CANCELLED'],
  ])('%s이면 %s이고 환불하지 않는다', async (_, change, code) => {
    state.target = { ...TARGET, ...change };
    expect(await cancelByOwnerFault({ reservationId: RESERVATION })).toMatchObject({
      ok: false,
      error: { code },
    });
    expect(state.flows).toEqual([]);
  });

  it('고객 취소·합의 후 취소가 진행 중이면 CANCEL_FINISHING(한 예약에 취소 환불은 하나)', async () => {
    for (const reason of ['customer_cancel', 'agreed_cancel'] as const) {
      state.target = {
        ...TARGET,
        requested: {
          reason,
          band: null,
          penaltyRate: 50,
          refundAmount: 21_000,
          penaltyAmount: 21_000,
          requestedAt: NOW,
        },
      };
      expect(await cancelByOwnerFault({ reservationId: RESERVATION })).toMatchObject({
        error: { code: 'CANCEL_FINISHING' },
      });
    }
    expect(state.flows).toEqual([]);
  });

  it('진행 중인 원장님 귀책 취소를 다시 누르면 저장해 둔 값으로 이어서 한다(그 사이 시작 시각이 지났어도)', async () => {
    const requested = {
      reason: 'owner_fault' as const,
      band: null,
      penaltyRate: 0,
      refundAmount: 42_000,
      penaltyAmount: 0,
      requestedAt: new Date(START.getTime() - 60_000),
    };
    state.target = { ...TARGET, requested };
    state.now = new Date(START.getTime() + 60_000);
    await cancelByOwnerFault({ reservationId: RESERVATION });
    expect(state.flows).toMatchObject([{ input: { requested } }]);
  });

  it('없는 예약·원장님이 아니면 환불하지 않는다', async () => {
    state.target = null;
    expect(await cancelByOwnerFault({ reservationId: RESERVATION })).toMatchObject({
      error: { code: 'RESERVATION_NOT_FOUND' },
    });
    state.auth = fail('UNAUTHORIZED', '로그인해 주세요');
    expect(await cancelByOwnerFault({ reservationId: RESERVATION })).toMatchObject({
      error: { code: 'UNAUTHORIZED' },
    });
    expect(state.flows).toEqual([]);
  });
});
