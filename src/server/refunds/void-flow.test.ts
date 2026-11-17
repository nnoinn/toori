// 예약 무효(A-108, #423)의 환불 진행과 정리 작업. 포트원에 보내는 값(사유 '예약 무효', 지금 취소할 수 있는 금액),
// 결과별 처리(끝냄·기다림·지움), 거절 뒤 취소 내역에서 무효 환불만 고르는지, 정리 작업의 기준·세기를 본다.
// 포트원·저장·알림은 가짜로 바꾼다. 저장 자체는 void-store.db.test.ts가 실제 DB로 본다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { getDb } from '@/db';
import type { PortOneCancel, PortOneLookup } from '@/server/payments/portone';

const state = vi.hoisted(() => ({
  steps: [] as unknown[],
  refund: null as unknown,
  lookup: null as unknown,
  /** 차례로 돌려줄 조회 결과. 비면 lookup */
  lookupQueue: [] as unknown[],
  finished: { couponReturned: false } as { couponReturned: boolean } | null,
  finishError: null as Error | null,
  stale: [] as unknown[],
  staleReads: [] as unknown[],
}));

vi.mock('@/server/policy', () => ({ ORDER_SWEEP_BATCH: 20, STALE_CANCEL_MINUTES: 5 }));
vi.mock('@/server/payments/portone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/payments/portone')>()),
  getPortOnePayment: async (paymentId: string) => {
    state.steps.push(['lookup', paymentId]);
    return state.lookupQueue.length > 0 ? state.lookupQueue.shift() : state.lookup;
  },
}));
vi.mock('./refund-payment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./refund-payment')>()),
  refundPayment: async (input: unknown) => {
    state.steps.push(['refund', input]);
    return state.refund;
  },
}));
vi.mock('./void-store', () => ({
  finishVoid: async (tx: unknown, input: unknown) => {
    state.steps.push(['finish', tx, input]);
    if (state.finishError) throw state.finishError;
    return state.finished;
  },
  clearVoidRequest: async (_db: unknown, reservationId: string) => {
    state.steps.push(['clear', reservationId]);
  },
  readStaleVoids: async (_db: unknown, input: unknown) => {
    state.staleReads.push(input);
    return state.stale;
  },
}));
vi.mock('@/server/notifications/alerts', () => ({
  notifyReservationVoided: (_db: unknown, reservationId: string, input: unknown) => {
    state.steps.push(['notify', reservationId, input]);
  },
}));

const { lookUpVoidRefund, runVoidRefund, sweepStaleVoids } = await import('./void-flow');

const db = {
  transaction: async (run: (tx: string) => unknown) => run('tx'),
} as unknown as ReturnType<typeof getDb>;
const NOW = new Date('2026-11-16T06:00:00.000Z');
const START = new Date('2026-11-15T06:00:00.000Z');

/** 30시간 전 고객 취소로 70%(29,400원)를 돌려준 예약의 남은 12,600원 무효 */
const INPUT = {
  reservationId: 'r-1',
  orderId: 'order-1',
  slotId: 'slot-1',
  paymentId: 'toori-1',
  startAt: START,
  refundAmount: 12_600,
  paidAmount: 42_000,
  refundedAmount: 29_400,
};

const paid = (cancellations: { id: string; amount: number | null; reason: string }[]) =>
  ({
    ok: true,
    payment: {
      status: 'PARTIAL_CANCELLED',
      amountTotal: 42_000,
      failureReason: null,
      failureCode: null,
      cancellations,
      cancelInProgress: false,
    },
  }) as unknown as PortOneLookup;

const names = () => state.steps.map((step) => (step as unknown[])[0]);

beforeEach(() => {
  state.steps = [];
  state.refund = { ok: true, cancellationId: 'c-void', amount: 12_600 } satisfies PortOneCancel;
  state.lookup = paid([]);
  state.lookupQueue = [];
  state.finished = { couponReturned: false };
  state.finishError = null;
  state.stale = [];
  state.staleReads = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('runVoidRefund', () => {
  it('남은 금액만 사유 "예약 무효"로, 지금 취소할 수 있는 금액(결제액 − 돌려준 금액)과 같이 보낸다', async () => {
    expect(await runVoidRefund(db, INPUT, NOW)).toEqual({
      state: 'finished',
      refundAmount: 12_600,
    });
    expect(state.steps).toEqual([
      [
        'refund',
        {
          paymentId: 'toori-1',
          paidAmount: 42_000,
          refundAmount: 12_600,
          reason: '예약 무효',
          cancellableAmount: 12_600,
        },
      ],
      [
        'finish',
        'tx',
        {
          reservationId: 'r-1',
          orderId: 'order-1',
          slotId: 'slot-1',
          startAt: START,
          refundAmount: 12_600,
          pgCancellationId: 'c-void',
          now: NOW,
        },
      ],
      ['notify', 'r-1', { refundAmount: 12_600, couponReturned: false }],
    ]);
  });

  it('포트원이 금액을 알려주지 않으면 저장한 금액으로 끝내고, 쓴 쿠폰을 돌려줬으면 알림에 알린다', async () => {
    state.refund = { ok: true, cancellationId: 'c-void', amount: null };
    state.finished = { couponReturned: true };
    expect(await runVoidRefund(db, INPUT, NOW)).toEqual({
      state: 'finished',
      refundAmount: 12_600,
    });
    expect(state.steps.at(-1)).toEqual([
      'notify',
      'r-1',
      { refundAmount: 12_600, couponReturned: true },
    ]);
  });

  it.each(['pending', 'unavailable'] as const)(
    '결과를 기다리거나 모르면(%s) 진행 중으로 두고 pending(지우지도 끝내지도 않는다)',
    async (reason) => {
      state.refund = { ok: false, reason };
      expect(await runVoidRefund(db, INPUT, NOW)).toEqual({ state: 'pending' });
      expect(names()).toEqual(['refund']);
    },
  );

  it('거절됐어도 취소 내역에 무효 환불이 있으면 그것만 더해서 끝낸다(앞선 고객 취소 환불은 빼고)', async () => {
    state.refund = { ok: false, reason: 'rejected' };
    state.lookup = paid([
      { id: 'c-customer', amount: 29_400, reason: '고객 예약 취소' },
      { id: 'c-void', amount: 12_600, reason: '예약 무효' },
    ]);
    expect(await runVoidRefund(db, INPUT, NOW)).toEqual({
      state: 'finished',
      refundAmount: 12_600,
    });
    expect(state.steps[2]).toEqual([
      'finish',
      'tx',
      expect.objectContaining({ refundAmount: 12_600, pgCancellationId: 'c-void' }),
    ]);
  });

  it('거절됐고 무효 환불이 없으면 진행 중 기록을 지우고 failed', async () => {
    state.refund = { ok: false, reason: 'rejected' };
    state.lookup = paid([{ id: 'c-customer', amount: 29_400, reason: '고객 예약 취소' }]);
    expect(await runVoidRefund(db, INPUT, NOW)).toEqual({ state: 'failed' });
    expect(names()).toEqual(['refund', 'lookup', 'clear']);
  });

  it('거절됐고 결제사가 처리 중이거나 포트원에 묻지 못하면 기록을 두고 pending', async () => {
    state.refund = { ok: false, reason: 'rejected' };
    state.lookup = { ok: false, reason: 'unavailable' } satisfies PortOneLookup;
    expect(await runVoidRefund(db, INPUT, NOW)).toEqual({ state: 'pending' });
    expect(names()).toEqual(['refund', 'lookup']);
  });

  it('그 사이 다른 쪽이 끝냈으면 already이고 알림은 보내지 않는다', async () => {
    state.finished = null;
    expect(await runVoidRefund(db, INPUT, NOW)).toEqual({ state: 'already' });
    expect(names()).not.toContain('notify');
  });

  it('환불 뒤 저장이 실패하면 pending(정리 작업이 끝낸다)이고 지우지 않는다', async () => {
    state.finishError = new Error('연결 끊김');
    expect(await runVoidRefund(db, INPUT, NOW)).toEqual({ state: 'pending' });
    expect(names()).toEqual(['refund', 'finish']);
    expect(console.error).toHaveBeenCalled();
  });
});

describe('lookUpVoidRefund', () => {
  it('포트원에 결제가 없으면 none, 묻지 못하면 pending', async () => {
    state.lookup = { ok: false, reason: 'not_found' } satisfies PortOneLookup;
    expect(await lookUpVoidRefund('toori-1')).toEqual({ state: 'none' });
    state.lookup = { ok: false, reason: 'unavailable' } satisfies PortOneLookup;
    expect(await lookUpVoidRefund('toori-1')).toEqual({ state: 'pending' });
  });

  it('무효 환불 금액 하나라도 모르면 금액은 null', async () => {
    state.lookup = paid([{ id: 'c-void', amount: null, reason: '예약 무효' }]);
    expect(await lookUpVoidRefund('toori-1')).toEqual({
      state: 'refunded',
      refund: { cancellationId: 'c-void', amount: null, reasons: ['예약 무효'] },
    });
  });
});

describe('sweepStaleVoids', () => {
  const stale = (reservationId: string, paymentId = 'toori-1') => ({
    reservationId,
    orderId: `order-${reservationId}`,
    slotId: `slot-${reservationId}`,
    paymentId,
    startAt: START,
    refundAmount: 12_600,
  });

  it('5분 넘은 진행 중 무효를 20건까지 읽는다', async () => {
    expect(await sweepStaleVoids(db, NOW)).toEqual({
      checked: 0,
      finished: 0,
      cleared: 0,
      left: 0,
    });
    expect(state.staleReads).toEqual([
      { requestedBefore: new Date('2026-11-16T05:55:00.000Z'), limit: 20 },
    ]);
  });

  it('포트원을 다시 부르지 않고 취소 내역만 보고 끝내거나 지운다. 한 건이 실패해도 계속한다', async () => {
    state.stale = [stale('a'), stale('b'), stale('c')];
    state.lookupQueue = [
      paid([{ id: 'c-void', amount: 12_600, reason: '예약 무효' }]),
      { ok: false, reason: 'unavailable' },
      paid([]),
    ];
    expect(await sweepStaleVoids(db, NOW)).toEqual({
      checked: 3,
      finished: 1,
      cleared: 1,
      left: 1,
    });
    expect(names()).not.toContain('refund');
    expect(state.steps).toContainEqual(['clear', 'c']);
  });

  it('저장이 실패한 건은 남겨 두고 다음 건을 계속한다', async () => {
    state.stale = [stale('a'), stale('b')];
    state.lookup = paid([{ id: 'c-void', amount: 12_600, reason: '예약 무효' }]);
    state.finishError = new Error('연결 끊김');
    expect(await sweepStaleVoids(db, NOW)).toEqual({
      checked: 2,
      finished: 0,
      cleared: 0,
      left: 2,
    });
    expect(console.error).toHaveBeenCalledTimes(2);
  });

  it('시드·시나리오 주문은 포트원에 묻지 않고 저장한 금액으로 끝낸다', async () => {
    state.stale = [stale('a', 'seed_order_1')];
    expect(await sweepStaleVoids(db, NOW)).toEqual({
      checked: 1,
      finished: 1,
      cleared: 0,
      left: 0,
    });
    expect(names()).not.toContain('lookup');
    expect(state.steps).toContainEqual([
      'finish',
      'tx',
      expect.objectContaining({ refundAmount: 12_600, pgCancellationId: null }),
    ]);
  });
});
