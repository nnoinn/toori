// 오래된 주문 정리 (C-406, W12 ②). 포트원 상태별로 무엇을 하는지, 한 건이 실패해도 계속하는지 본다.
// 저장과 포트원은 가짜로 바꿔서 DB 없이 돈다. 정리 대상 고르기는 order-store.db.test.ts, 저장은 confirm-store.db.test.ts가 본다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { getDb } from '@/db';

import type { StaleOrder } from './order-store';
import type { PortOneLookup, PortOnePayment } from './portone';
import type { SettleOutcome } from './settle-order';
import { sweepStaleOrders } from './sweep-orders';

const state = vi.hoisted(() => ({
  stale: [] as unknown[],
  readInput: null as unknown,
  lookups: new Map<string, unknown>(),
  outcomes: [] as unknown[],
  failed: [] as unknown[],
  settled: [] as unknown[],
  settle: null as unknown,
  cancelled: [] as unknown[],
  cancel: true as boolean,
  marked: [] as unknown[],
}));

vi.mock('./order-store', () => ({
  readStaleOrders: async (_db: unknown, input: unknown) => {
    state.readInput = input;
    return state.stale;
  },
  markOrderChecked: async (_db: unknown, orderId: string, now: Date) => {
    state.marked.push({ orderId, now });
  },
}));
vi.mock('./portone', () => ({
  getPortOnePayment: async (paymentId: string) => {
    const lookup = state.lookups.get(paymentId);
    if (lookup instanceof Error) throw lookup;
    return lookup;
  },
}));
vi.mock('./confirm-store', () => ({
  recordOrderOutcome: async (_db: unknown, orderId: string, outcome: unknown) => {
    state.outcomes.push({ orderId, outcome });
    return true;
  },
}));
vi.mock('./settle-order', () => ({
  autoCancelOrder: async (_db: unknown, order: { orderId: string }) => {
    state.cancelled.push(order.orderId);
    return state.cancel;
  },
  recordFailedPayment: async (_db: unknown, orderId: string, payment: PortOnePayment) => {
    state.failed.push({ orderId, status: payment.status });
    return true;
  },
  settlePaidOrder: async (_db: unknown, order: { orderId: string }, _p: unknown, now: Date) => {
    state.settled.push({ orderId: order.orderId, now });
    return state.settle;
  },
}));

const NOW = new Date('2026-11-01T03:00:00.000Z');
const db = 'db' as unknown as ReturnType<typeof getDb>;

const order = (id: string, status: StaleOrder['status'] = 'pending'): StaleOrder => ({
  orderId: `order-${id}`,
  paymentId: `toori-${id}`,
  amount: 23_450,
  status,
});
const found = (status: string): PortOneLookup => ({
  ok: true,
  payment: {
    status,
    amountTotal: 23_450,
    currency: 'KRW',
    paidAt: NOW,
    method: 'PaymentMethodCard',
    failureReason: null,
    failureCode: null,
    cancellations: [],
    cancelInProgress: false,
  },
});
const EMPTY = { checked: 1, confirmed: 0, autoCancelled: 0, failed: 0, abandoned: 0, left: 0 };

/** 주문 하나를 이 포트원 결과로 정리한다 */
function oneOrder(lookup: PortOneLookup) {
  state.stale = [order('a')];
  state.lookups.set('toori-a', lookup);
  return sweepStaleOrders(db, NOW);
}

beforeEach(() => {
  state.stale = [];
  state.readInput = null;
  state.lookups = new Map();
  state.outcomes = [];
  state.failed = [];
  state.settled = [];
  state.settle = { ok: true, reservationId: 'r', reservationCode: 'ABCD2345' };
  state.cancelled = [];
  state.cancel = true;
  state.marked = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('sweepStaleOrders', () => {
  it('30분 전에 만든 주문까지 한 번에 20건을 고른다', async () => {
    expect(await sweepStaleOrders(db, NOW)).toEqual({ ...EMPTY, checked: 0 });
    expect(state.readInput).toEqual({
      createdBefore: new Date('2026-11-01T02:30:00.000Z'),
      limit: 20,
    });
  });

  it.each<[string, PortOneLookup, string]>([
    ['결제창까지 가지 않음(없음)', { ok: false, reason: 'not_found' }, 'NOT_FOUND'],
    ['결제창에서 결제하지 않음(READY)', found('READY'), 'READY'],
  ])('%s: 실패로 기록하고 결제 안 함 코드를 남긴다', async (_, lookup, pgStatus) => {
    expect(await oneOrder(lookup)).toEqual({ ...EMPTY, abandoned: 1 });
    expect(state.outcomes).toEqual([
      { orderId: 'order-a', outcome: { status: 'failed', pgStatus, failureCode: 'ABANDONED' } },
    ]);
  });

  it.each(['FAILED', 'CANCELLED', 'PARTIAL_CANCELLED'])(
    '결제가 안 됨(%s): 실패로 기록한다',
    async (status) => {
      expect(await oneOrder(found(status))).toEqual({ ...EMPTY, failed: 1 });
      expect(state.failed).toEqual([{ orderId: 'order-a', status }]);
      expect(state.outcomes).toEqual([]);
    },
  );

  it('결제 완료(PAID)이고 확정되면 confirmed(창을 닫은 고객의 예약을 살린다)', async () => {
    expect(await oneOrder(found('PAID'))).toEqual({ ...EMPTY, confirmed: 1 });
    expect(state.settled).toEqual([{ orderId: 'order-a', now: NOW }]);
  });

  it.each<[string, SettleOutcome, Partial<typeof EMPTY>]>([
    [
      '확정 못 해 자동 취소',
      { ok: false, code: 'HOLD_EXPIRED', autoCancelled: true },
      { autoCancelled: 1 },
    ],
    ['취소도 끝내지 못함', { ok: false, code: 'HOLD_EXPIRED', autoCancelled: false }, { left: 1 }],
  ])('결제 완료(PAID)인데 %s', async (_, settle, expected) => {
    state.settle = settle;
    expect(await oneOrder(found('PAID'))).toEqual({ ...EMPTY, ...expected });
  });

  it.each<[string, PortOneLookup]>([
    ['결제사 처리 중(PENDING)', found('PENDING')],
    ['가상계좌 발급', found('VIRTUAL_ACCOUNT_ISSUED')],
    ['모르는 상태', found('SOMETHING_NEW')],
    ['포트원에 묻지 못함', { ok: false, reason: 'unavailable' }],
  ])('%s: 그대로 두고 다음 실행이 다시 본다', async (_, lookup) => {
    expect(await oneOrder(lookup)).toEqual({ ...EMPTY, left: 1 });
    expect(state.outcomes).toEqual([]);
    expect(state.failed).toEqual([]);
    expect(state.settled).toEqual([]);
  });

  it('취소를 끝내지 못한 주문(paid)은 포트원 조회 없이 취소를 다시 시도한다', async () => {
    state.stale = [order('a', 'paid')];
    expect(await sweepStaleOrders(db, NOW)).toEqual({ ...EMPTY, autoCancelled: 1 });
    expect(state.cancelled).toEqual(['order-a']);

    state.cancel = false;
    expect(await sweepStaleOrders(db, NOW)).toEqual({ ...EMPTY, left: 1 });
  });

  it('한 건이 실패해도 나머지를 계속하고 left로 센다', async () => {
    state.stale = [order('a'), order('b'), order('c')];
    state.lookups.set('toori-a', found('READY'));
    state.lookups.set('toori-b', new Error('boom'));
    state.lookups.set('toori-c', found('PAID'));
    expect(await sweepStaleOrders(db, NOW)).toEqual({
      checked: 3,
      confirmed: 1,
      autoCancelled: 0,
      failed: 0,
      abandoned: 1,
      left: 1,
    });
  });

  it('결과를 정하지 못한 주문만 뒤로 보내서 다음 실행이 안 본 주문부터 본다', async () => {
    state.stale = [order('a'), order('b'), order('c')];
    state.lookups.set('toori-a', found('PENDING'));
    state.lookups.set('toori-b', new Error('boom'));
    state.lookups.set('toori-c', found('PAID'));
    await sweepStaleOrders(db, NOW);
    expect(state.marked).toEqual([
      { orderId: 'order-a', now: NOW },
      { orderId: 'order-b', now: NOW },
    ]);
  });
});
