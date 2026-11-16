// 운영자 결제·환불 확인 (#373 ①). 권한·사유·정리 대상 기준·실패 코드·처리 기록에 남기는 값을 본다.
// 로그인·DB·시각과 정리 함수(포트원을 부른다)는 가짜로 바꿔서 DB 없이 돈다.
// 실제 읽기·잠금은 payment-issues-store.db.test.ts, 정리 대상 고르기는 order-store·refund-store DB 테스트가 본다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';

const ORDER = '7f8091a2-b3c4-4d5e-8f60-718293a4b5c6';
const RESERVATION = '8091a2b3-c4d5-4e6f-9071-8293a4b5c6d7';
const REFUND = '91a2b3c4-d5e6-4f70-8182-93a4b5c6d7e8';
const NOW = new Date('2026-11-15T03:00:00.000Z');

const state = vi.hoisted(() => ({
  auth: null as unknown,
  staleOrders: [] as unknown[],
  orderReads: [] as unknown[],
  orderState: null as unknown,
  sweepResult: 'confirmed' as unknown,
  swept: [] as unknown[],
  staleCancels: [] as unknown[],
  cancelReads: [] as unknown[],
  requested: false,
  settleResult: 'finished' as unknown,
  settled: [] as unknown[],
  review: null as unknown,
  recorded: [] as unknown[],
}));

vi.mock('@/lib/request-time', () => ({ getRequestNow: async () => NOW }));
vi.mock('@/server/auth', () => ({ requireAdmin: async () => state.auth }));
vi.mock('@/db', () => ({
  getDb: () => ({ name: 'db', transaction: (run: (tx: string) => unknown) => run('tx') }),
}));
vi.mock('@/server/payments/order-store', () => ({
  readStaleOrders: async (_db: unknown, input: unknown) => {
    state.orderReads.push(input);
    return state.staleOrders;
  },
}));
vi.mock('@/server/payments/sweep-orders', () => ({
  sweepOneOrder: async (_db: unknown, order: unknown, now: Date) => {
    state.swept.push({ order, now });
    return state.sweepResult;
  },
}));
vi.mock('@/server/refunds/refund-store', () => ({
  readStaleCancels: async (_db: unknown, input: unknown) => {
    state.cancelReads.push(input);
    return state.staleCancels;
  },
}));
vi.mock('@/server/refunds/finish-cancel', () => ({
  settleRequestedCancel: async (_db: unknown, request: unknown, now: Date) => {
    state.settled.push({ request, now });
    if (state.settleResult instanceof Error) throw state.settleResult;
    return state.settleResult;
  },
}));
vi.mock('./payment-issues-store', () => ({
  REFUND_REVIEW_CHECK_ACTION: 'refund.review_check',
  readOrderState: async () => state.orderState,
  hasRequestedCancel: async () => state.requested,
  lockRefundReview: async (tx: unknown, refundId: string) => {
    state.recorded.push({ lockedIn: tx, refundId });
    return state.review;
  },
}));
vi.mock('./action-store', () => ({
  recordAdminAction: async (db: unknown, row: unknown) => {
    state.recorded.push({ db: typeof db === 'string' ? db : 'db', row });
  },
}));

const { checkRefundReview, retryStuckCancel, retryStuckOrder } = await import('./payment-issues');

const STALE_ORDER = { orderId: ORDER, paymentId: 'toori-a', amount: 23_450, status: 'paid' };
const STALE_CANCEL = { reservationId: RESERVATION, reason: 'customer_cancel' };

beforeEach(() => {
  state.auth = ok({ userId: 'admin-1' });
  state.staleOrders = [STALE_ORDER];
  state.orderReads = [];
  state.orderState = null;
  state.sweepResult = 'autoCancelled';
  state.swept = [];
  state.staleCancels = [STALE_CANCEL];
  state.cancelReads = [];
  state.requested = false;
  state.settleResult = 'finished';
  state.settled = [];
  state.review = { reviewReason: '포트원 환불액이 달라요', checked: false };
  state.recorded = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('retryStuckOrder', () => {
  it('운영자가 아니면 그 실패를 그대로 돌려주고 아무것도 하지 않는다', async () => {
    state.auth = fail('NOT_ADMIN', '운영자만 할 수 있어요');
    expect(await retryStuckOrder({ orderId: ORDER, reason: '확인' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_ADMIN' },
    });
    expect(state.orderReads).toEqual([]);
    expect(state.recorded).toEqual([]);
  });

  it('주문 id 모양이 틀리면 ORDER_NOT_FOUND, 사유가 빈칸이면 REASON_REQUIRED', async () => {
    expect(await retryStuckOrder({ orderId: 'x', reason: '확인' })).toMatchObject({
      error: { code: 'ORDER_NOT_FOUND' },
    });
    expect(await retryStuckOrder({ orderId: ORDER, reason: '  ' })).toMatchObject({
      error: { code: 'REASON_REQUIRED', message: '사유를 적어 주세요' },
    });
    expect(state.swept).toEqual([]);
  });

  it('정리 작업과 같은 기준(30분 전에 만든 주문)으로 그 주문 하나만 읽어 정리하고, 결과와 사유를 처리 기록에 남긴다', async () => {
    expect(await retryStuckOrder({ orderId: ORDER, reason: ' 포트원 응답 없음 ' })).toEqual({
      ok: true,
      data: { orderId: ORDER, result: 'autoCancelled' },
    });
    expect(state.orderReads).toEqual([
      { createdBefore: new Date('2026-11-15T02:30:00.000Z'), limit: 1, orderId: ORDER },
    ]);
    expect(state.swept).toEqual([{ order: STALE_ORDER, now: NOW }]);
    expect(state.recorded).toEqual([
      {
        db: 'db',
        row: {
          adminId: 'admin-1',
          action: 'payment.retry',
          targetType: 'order',
          targetId: ORDER,
          memo: 'autoCancelled: 포트원 응답 없음',
        },
      },
    ]);
  });

  it('이번에도 정하지 못했으면(left) 그대로 성공으로 돌려주고 기록한다(목록에 남는다)', async () => {
    state.sweepResult = 'left';
    expect(await retryStuckOrder({ orderId: ORDER, reason: '다시' })).toMatchObject({
      ok: true,
      data: { result: 'left' },
    });
    expect(state.recorded).toMatchObject([{ row: { memo: 'left: 다시' } }]);
  });

  it.each([
    ['없는 주문', null, 'ORDER_NOT_FOUND'],
    ['이미 확정된 주문', { status: 'confirmed' }, 'ALREADY_RESOLVED'],
    ['이미 실패로 정리된 주문', { status: 'failed' }, 'ALREADY_RESOLVED'],
    ['자동 취소된 주문', { status: 'auto_cancelled' }, 'ALREADY_RESOLVED'],
    ['아직 30분이 안 된 결제 대기 주문', { status: 'pending' }, 'TOO_SOON'],
    ['아직 30분이 안 된 결제 확인 주문', { status: 'paid' }, 'TOO_SOON'],
  ])('정리 대상이 아니면(%s) %s', async (_, orderState, code) => {
    state.staleOrders = [];
    state.orderState = orderState;
    expect(await retryStuckOrder({ orderId: ORDER, reason: '확인' })).toMatchObject({
      ok: false,
      error: { code },
    });
    expect(state.swept).toEqual([]);
    expect(state.recorded).toEqual([]);
  });
});

describe('retryStuckCancel', () => {
  it('정리 작업과 같은 기준(5분 전에 요청한 취소)으로 그 예약 하나만 읽어 정리하고, 결과와 사유를 처리 기록에 남긴다', async () => {
    expect(
      await retryStuckCancel({ reservationId: RESERVATION, reason: '포트원 콘솔 확인' }),
    ).toEqual({ ok: true, data: { reservationId: RESERVATION, result: 'finished' } });
    expect(state.cancelReads).toEqual([
      {
        requestedBefore: new Date('2026-11-15T02:55:00.000Z'),
        limit: 1,
        reservationId: RESERVATION,
      },
    ]);
    expect(state.settled).toEqual([{ request: STALE_CANCEL, now: NOW }]);
    expect(state.recorded).toEqual([
      {
        db: 'db',
        row: {
          adminId: 'admin-1',
          action: 'refund.retry',
          targetType: 'reservation',
          targetId: RESERVATION,
          memo: 'finished: 포트원 콘솔 확인',
        },
      },
    ]);
  });

  it('정리 중 오류가 나면 던지지 않고 left로 기록한다', async () => {
    state.settleResult = new Error('portone down');
    expect(await retryStuckCancel({ reservationId: RESERVATION, reason: '다시' })).toEqual({
      ok: true,
      data: { reservationId: RESERVATION, result: 'left' },
    });
    expect(state.recorded).toMatchObject([{ row: { memo: 'left: 다시' } }]);
  });

  it('진행 중 취소가 아직 5분 전이면 TOO_SOON, 없으면 CANCEL_NOT_FOUND', async () => {
    state.staleCancels = [];
    state.requested = true;
    expect(await retryStuckCancel({ reservationId: RESERVATION, reason: '확인' })).toMatchObject({
      error: { code: 'TOO_SOON' },
    });
    state.requested = false;
    expect(await retryStuckCancel({ reservationId: RESERVATION, reason: '확인' })).toMatchObject({
      error: { code: 'CANCEL_NOT_FOUND' },
    });
    expect(state.settled).toEqual([]);
    expect(state.recorded).toEqual([]);
  });

  it('사유가 상한을 넘으면 REASON_TOO_LONG', async () => {
    expect(
      await retryStuckCancel({ reservationId: RESERVATION, reason: '가'.repeat(1001) }),
    ).toMatchObject({ error: { code: 'REASON_TOO_LONG' } });
  });
});

describe('checkRefundReview', () => {
  it('환불 줄을 잠근 같은 트랜잭션에서 [확인함]과 사유를 기록한다', async () => {
    expect(await checkRefundReview({ refundId: REFUND, reason: ' 포트원 콘솔과 맞음 ' })).toEqual({
      ok: true,
      data: { refundId: REFUND },
    });
    expect(state.recorded).toEqual([
      { lockedIn: 'tx', refundId: REFUND },
      {
        db: 'tx',
        row: {
          adminId: 'admin-1',
          action: 'refund.review_check',
          targetType: 'refund',
          targetId: REFUND,
          memo: '포트원 콘솔과 맞음',
        },
      },
    ]);
  });

  it.each([
    ['없는 환불', null, 'REFUND_NOT_FOUND'],
    ['확인할 이유가 없는 환불', { reviewReason: null, checked: false }, 'NO_REVIEW_NEEDED'],
    ['이미 확인한 환불', { reviewReason: '금액 다름', checked: true }, 'ALREADY_CHECKED'],
  ])('%s면 %s이고 기록하지 않는다', async (_, review, code) => {
    state.review = review;
    expect(await checkRefundReview({ refundId: REFUND, reason: '확인' })).toMatchObject({
      ok: false,
      error: { code },
    });
    expect(state.recorded.filter((entry) => 'row' in (entry as object))).toEqual([]);
  });
});
