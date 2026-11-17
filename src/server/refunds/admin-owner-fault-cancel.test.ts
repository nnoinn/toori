// 운영자가 원장님 대신 하는 원장님 사정 취소 (#373 ③-2). 권한·id·사유, 원장님 취소와 같은 막는 조건·환불 진행에 넘기는 값,
// 처리 기록("결과: 사유", 막혀서 아무것도 안 했으면 남기지 않음), 성공했을 때만 원장님 알림을 보내는지 본다.
// 로그인·DB·시각·환불 진행(cancel-flow, cancel.test.ts가 본다)·처리 기록·알림은 가짜로 바꾼다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';
import { ADMIN_REASON_LIMIT } from '@/server/policy/admin';

import type { RefundTarget } from './refund-store';

const RESERVATION = '5d6e7f80-9a1b-4c2d-8e3f-405162738495';
const START = new Date('2026-11-17T06:00:00.000Z');
const NOW = new Date('2026-11-16T06:00:00.000Z');

const state = vi.hoisted(() => ({
  auth: null as unknown,
  now: new Date(),
  target: null as unknown,
  flows: [] as unknown[],
  flowResult: null as unknown,
  flowError: null as Error | null,
  actions: [] as unknown[],
  notified: [] as unknown[],
}));

vi.mock('@/lib/request-time', () => ({ getRequestNow: async () => state.now }));
vi.mock('@/server/auth', () => ({ requireAdmin: async () => state.auth }));
vi.mock('@/db', () => ({ getDb: () => 'db' }));
vi.mock('./refund-store', () => ({
  readRefundTargetById: async () => state.target,
}));
vi.mock('./cancel-flow', () => ({
  runCancelRefund: async (db: unknown, input: unknown) => {
    state.flows.push({ db, input });
    if (state.flowError) throw state.flowError;
    return state.flowResult;
  },
}));
vi.mock('@/server/admin/action-store', () => ({
  recordAdminAction: async (db: unknown, row: unknown) => {
    state.actions.push({ db, row });
  },
}));
vi.mock('@/server/notifications/alerts', () => ({
  notifyOwnerFaultCancelledByAdmin: (_db: unknown, id: string) => state.notified.push(id),
}));

const { cancelByOwnerFaultAsAdmin } = await import('./admin-owner-fault-cancel');

const TARGET: RefundTarget = {
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

const cancel = (reason = '원장님이 전화로 요청') =>
  cancelByOwnerFaultAsAdmin({ reservationId: RESERVATION, reason });

beforeEach(() => {
  state.auth = ok({ userId: 'admin-1' });
  state.now = NOW;
  state.target = TARGET;
  state.flows = [];
  state.flowResult = ok({
    reservationId: RESERVATION,
    refundAmount: 42_000,
    cancelledAt: NOW.toISOString(),
  });
  state.flowError = null;
  state.actions = [];
  state.notified = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('cancelByOwnerFaultAsAdmin', () => {
  it('원장님 취소와 같은 값(결제액 전부, 원장님 사정 사유)으로 환불을 진행하고, "cancelled: 사유"를 남기고 원장님에게 알린다', async () => {
    expect(await cancel('  원장님이 전화로 요청 ')).toEqual(state.flowResult);
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
    expect(state.actions).toEqual([
      {
        db: 'db',
        row: {
          adminId: 'admin-1',
          action: 'reservation.owner_fault_cancel',
          targetType: 'reservation',
          targetId: RESERVATION,
          memo: 'cancelled: 원장님이 전화로 요청',
        },
      },
    ]);
    expect(state.notified).toEqual([RESERVATION]);
  });

  it('환불이 실패하거나 결과를 기다리면 그 코드로 기록을 남기고 원장님 알림은 보내지 않는다', async () => {
    state.flowResult = fail('REFUND_FAILED', '환불하지 못했어요');
    expect(await cancel()).toMatchObject({ error: { code: 'REFUND_FAILED' } });
    state.flowError = new Error('boom');
    expect(await cancel()).toMatchObject({ error: { code: 'CANCEL_FINISHING' } });
    expect(state.actions.map((action) => (action as { row: { memo: string } }).row.memo)).toEqual([
      'REFUND_FAILED: 원장님이 전화로 요청',
      'CANCEL_FINISHING: 원장님이 전화로 요청',
    ]);
    expect(state.notified).toEqual([]);
  });

  it.each([
    ['딱 시작 시각', { startAt: NOW }, 'ALREADY_STARTED'],
    ['방문·노쇼 처리됨', { status: 'completed' as const }, 'ALREADY_STARTED'],
    ['이미 취소됨', { status: 'cancelled' as const }, 'ALREADY_CANCELLED'],
    [
      '고객 취소가 진행 중',
      {
        requested: {
          reason: 'customer_cancel' as const,
          band: null,
          penaltyRate: 50,
          refundAmount: 21_000,
          penaltyAmount: 21_000,
          requestedAt: NOW,
        },
      },
      'CANCEL_FINISHING',
    ],
  ])('%s이면 %s이고 환불·기록·알림을 하지 않는다', async (_, change, code) => {
    state.target = { ...TARGET, ...change };
    expect(await cancel()).toMatchObject({ ok: false, error: { code } });
    expect(state.flows).toEqual([]);
    expect(state.actions).toEqual([]);
    expect(state.notified).toEqual([]);
  });

  it('진행 중인 원장님 사정 취소는 시작 시각이 지났어도 저장해 둔 값으로 이어서 한다', async () => {
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
    await cancel();
    expect(state.flows).toMatchObject([{ input: { requested } }]);
  });

  it('운영자가 아니면 그 실패, 없거나 모양이 틀린 예약은 RESERVATION_NOT_FOUND, 사유가 비거나 길면 그 실패이고 아무것도 하지 않는다', async () => {
    state.auth = fail('FORBIDDEN', '운영자만 할 수 있어요');
    expect(await cancel()).toMatchObject({ error: { code: 'FORBIDDEN' } });
    state.auth = ok({ userId: 'admin-1' });
    expect(await cancelByOwnerFaultAsAdmin({ reservationId: 'x', reason: '요청' })).toMatchObject({
      error: { code: 'RESERVATION_NOT_FOUND' },
    });
    expect(await cancel('   ')).toMatchObject({ error: { code: 'REASON_REQUIRED' } });
    expect(await cancel('가'.repeat(ADMIN_REASON_LIMIT + 1))).toMatchObject({
      error: { code: 'REASON_TOO_LONG' },
    });
    state.target = null;
    expect(await cancel()).toMatchObject({ error: { code: 'RESERVATION_NOT_FOUND' } });
    expect(state.flows).toEqual([]);
    expect(state.actions).toEqual([]);
  });
});
