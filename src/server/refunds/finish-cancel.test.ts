// 환불이 끝난 취소 기록과 진행 중 취소의 결과 정하기 (W14, #222, 합의 후 취소 #320). 포트원·DB 저장은 가짜로 바꾼다. 저장 내용은 refund-store.db.test.ts가 본다.

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import type { getDb } from '@/db';

import type { CancelRequest } from './refund-store';

const state = vi.hoisted(() => ({
  lookup: null as unknown,
  finishes: [] as Record<string, unknown>[],
  finished: true,
  cleared: [] as string[],
  cancelAlerts: [] as unknown[],
  agreedAlerts: [] as unknown[],
  reopened: [] as unknown[],
}));

vi.mock('@/server/notifications/alerts', () => ({
  notifyReservationCancelled: (
    _db: unknown,
    reservationId: string,
    options: { by: string; now: Date },
  ) => {
    state.cancelAlerts.push({ reservationId, ...options });
  },
  notifyAgreedCancelResult: (_db: unknown, input: unknown) => {
    state.agreedAlerts.push(input);
  },
}));
vi.mock('./agreed-cancel-store', () => ({
  reopenAgreedRequest: async (_db: unknown, input: unknown) => {
    state.reopened.push(input);
  },
}));

vi.mock('@/server/payments/portone', async (original) => ({
  ...(await original<typeof import('@/server/payments/portone')>()),
  getPortOnePayment: async () => state.lookup,
}));
vi.mock('./refund-store', () => ({
  finishCancelRecord: async (_tx: unknown, input: Record<string, unknown>) => {
    state.finishes.push(input);
    return state.finished;
  },
  clearRequestedCancel: async (_db: unknown, reservationId: string) => {
    state.cleared.push(reservationId);
  },
}));

const { finishCancel, lookUpRefund, settleRequestedCancel } = await import('./finish-cancel');

const db = {
  transaction: (run: (tx: string) => unknown) => run('tx'),
} as unknown as ReturnType<typeof getDb>;
const START = new Date('2026-11-05T06:00:00.000Z');
const REQUESTED_AT = new Date('2026-11-04T00:00:00.000Z');
const NOW = new Date('2026-11-04T00:20:00.000Z');

const request: CancelRequest = {
  reservationId: 'reservation-1',
  orderId: 'order-1',
  slotId: 'slot-1',
  paymentId: 'toori-1',
  paidAmount: 45_000,
  startAt: START,
  reason: 'customer_cancel',
  band: 'over_24h',
  penaltyRate: 30,
  refundAmount: 31_500,
  penaltyAmount: 13_500,
  requestedAt: REQUESTED_AT,
};

function payment(
  cancellations: { id: string; amount: number; reason?: string }[],
  cancelInProgress = false,
): { ok: true; payment: Record<string, unknown> } {
  return { ok: true, payment: { status: 'PAID', cancellations, cancelInProgress } };
}

beforeEach(() => {
  state.lookup = payment([]);
  state.finishes = [];
  state.finished = true;
  state.cleared = [];
  state.cancelAlerts = [];
  state.agreedAlerts = [];
  state.reopened = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('finishCancel', () => {
  it('금액이 같으면 저장해 둔 값으로 끝내고, 남은 시간은 고객이 취소한 시각 기준이다', async () => {
    expect(await finishCancel(db, request, { cancellationId: 'c-1', amount: 31_500 }, NOW)).toEqual(
      { refundAmount: 31_500 },
    );
    expect(state.finishes).toEqual([
      {
        reason: 'customer_cancel',
        reservationId: 'reservation-1',
        orderId: 'order-1',
        slotId: 'slot-1',
        band: 'over_24h',
        penaltyRate: 30,
        refundAmount: 31_500,
        penaltyAmount: 13_500,
        pgCancellationId: 'c-1',
        reviewReason: null,
        hoursBeforeStart: 30,
        requestedAt: REQUESTED_AT,
        now: NOW,
      },
    ]);
    expect(console.error).not.toHaveBeenCalled();
    // 고객 취소 알림: 원장님에게 재등록 안내(S-400), 고객에게는 보내지 않는다
    expect(state.cancelAlerts).toEqual([
      { reservationId: 'reservation-1', by: 'customer', now: NOW },
    ]);
  });

  it('포트원이 금액을 알려주지 않으면 저장해 둔 금액으로 끝낸다', async () => {
    expect(await finishCancel(db, request, { cancellationId: 'c-1', amount: null }, NOW)).toEqual({
      refundAmount: 31_500,
    });
    expect(state.finishes[0]).toMatchObject({ refundAmount: 31_500, reviewReason: null });
  });

  it('금액이 다르면 실제 금액으로 끝내고 운영자 확인 이유와 로그를 남긴다', async () => {
    expect(await finishCancel(db, request, { cancellationId: 'c-1', amount: 20_000 }, NOW)).toEqual(
      { refundAmount: 20_000 },
    );
    expect(state.finishes[0]).toMatchObject({
      refundAmount: 20_000,
      penaltyAmount: 25_000,
      reviewReason: '포트원 환불액 20000원이 계산한 31500원과 달라요',
    });
    expect(console.error).toHaveBeenCalled();
  });

  it('운영자 확인 메모를 받으면 금액이 같아도 남기고, 금액이 다르면 이유를 같이 남긴다', async () => {
    const refund = { cancellationId: 'c-1', amount: 31_500 };
    await finishCancel(db, request, refund, NOW, '나중에 처리된 취소예요');
    expect(state.finishes[0]).toMatchObject({ reviewReason: '나중에 처리된 취소예요' });
    await finishCancel(db, request, { ...refund, amount: 45_000 }, NOW, '나중에 처리된 취소예요');
    expect(state.finishes[1]).toMatchObject({
      reviewReason: '나중에 처리된 취소예요. 포트원 환불액 45000원이 계산한 31500원과 달라요',
    });
  });

  it('먼저 기록한 요청이 있으면 null이고 원장님 알림을 다시 부르지 않는다', async () => {
    state.finished = false;
    expect(
      await finishCancel(db, request, { cancellationId: 'c-1', amount: 31_500 }, NOW),
    ).toBeNull();
    expect(state.cancelAlerts).toEqual([]);
  });
});

describe('lookUpRefund', () => {
  it('끝난 취소가 있으면 refunded, 처리 중이면 pending, 없으면 none', async () => {
    state.lookup = payment([{ id: 'c-1', amount: 31_500, reason: '고객 예약 취소' }]);
    expect(await lookUpRefund('toori-1')).toEqual({
      state: 'refunded',
      refund: { cancellationId: 'c-1', amount: 31_500, reasons: ['고객 예약 취소'] },
    });
    state.lookup = payment([], true);
    expect(await lookUpRefund('toori-1')).toEqual({ state: 'pending' });
    state.lookup = payment([]);
    expect(await lookUpRefund('toori-1')).toEqual({ state: 'none' });
  });

  it('묻지 못하면 pending, 포트원에 결제가 없으면 none', async () => {
    state.lookup = { ok: false, reason: 'unavailable' };
    expect(await lookUpRefund('toori-1')).toEqual({ state: 'pending' });
    state.lookup = { ok: false, reason: 'not_found' };
    expect(await lookUpRefund('toori-1')).toEqual({ state: 'none' });
  });
});

describe('settleRequestedCancel', () => {
  it('끝난 환불이 있으면 실제 금액으로 끝낸다', async () => {
    state.lookup = payment([{ id: 'c-1', amount: 31_500 }]);
    expect(await settleRequestedCancel(db, request, NOW)).toBe('finished');
    expect(state.finishes[0]).toMatchObject({ refundAmount: 31_500, pgCancellationId: 'c-1' });
    expect(state.cleared).toEqual([]);
  });

  it('끝난 환불의 금액이 다르면 운영자 확인 이유를 남기고 끝낸다', async () => {
    state.lookup = payment([{ id: 'c-1', amount: 45_000 }]);
    expect(await settleRequestedCancel(db, request, NOW)).toBe('finished');
    expect(state.finishes[0]).toMatchObject({
      refundAmount: 45_000,
      penaltyAmount: 0,
      reviewReason: expect.stringContaining('45000원'),
    });
  });

  it('환불이 없으면 진행 중 표시를 지워서 다시 취소할 수 있게 한다', async () => {
    expect(await settleRequestedCancel(db, request, NOW)).toBe('cleared');
    expect(state.cleared).toEqual(['reservation-1']);
    expect(state.finishes).toEqual([]);
  });

  it('포트원에 결제가 없어도 지운다', async () => {
    state.lookup = { ok: false, reason: 'not_found' };
    expect(await settleRequestedCancel(db, request, NOW)).toBe('cleared');
    expect(state.cleared).toEqual(['reservation-1']);
  });

  it('결제사가 처리 중이면 그대로 둔다', async () => {
    state.lookup = payment([], true);
    expect(await settleRequestedCancel(db, request, NOW)).toBe('left');
    expect(state.cleared).toEqual([]);
    expect(state.finishes).toEqual([]);
  });

  it('포트원에 묻지 못하면 그대로 둔다', async () => {
    state.lookup = { ok: false, reason: 'unavailable' };
    expect(await settleRequestedCancel(db, request, NOW)).toBe('left');
    expect(state.cleared).toEqual([]);
  });

  it('예약이 이미 바뀌었으면 진행 중 표시만 지운다', async () => {
    state.lookup = payment([{ id: 'c-1', amount: 31_500 }]);
    state.finished = false;
    expect(await settleRequestedCancel(db, request, NOW)).toBe('cleared');
    expect(state.cleared).toEqual(['reservation-1']);
  });

  it.each([
    ['시드 주문', { paymentId: 'seed_abc' }, 31_500],
    ['시나리오 주문', { paymentId: 'scenario_user_abc' }, 31_500],
    ['돌려줄 돈 0원', { refundAmount: 0, penaltyAmount: 0, paidAmount: 0 }, 0],
  ])('%s은 포트원에 묻지 않고 끝낸다', async (_, extra, refundAmount) => {
    state.lookup = { ok: false, reason: 'unavailable' };
    expect(await settleRequestedCancel(db, { ...request, ...extra }, NOW)).toBe('finished');
    expect(state.finishes[0]).toMatchObject({ refundAmount, pgCancellationId: null });
  });
});

describe('합의 후 취소(#320)', () => {
  const agreed: CancelRequest = {
    ...request,
    reason: 'agreed_cancel',
    band: null,
    penaltyRate: 50,
    refundAmount: 22_500,
    penaltyAmount: 22_500,
  };

  it('끝내면 취소한 쪽 agreed로 기록하고 원장님에게 동의 알림(재등록 안내 없음)', async () => {
    expect(await finishCancel(db, agreed, { cancellationId: 'c-1', amount: 22_500 }, NOW)).toEqual({
      refundAmount: 22_500,
    });
    expect(state.finishes[0]).toMatchObject({
      reason: 'agreed_cancel',
      band: null,
      penaltyRate: 50,
    });
    expect(state.agreedAlerts).toEqual([
      { reservationId: 'reservation-1', requestId: 'reservation-1', result: 'agreed' },
    ]);
    expect(state.cancelAlerts).toEqual([]);
  });

  it('정리 작업이 환불이 없다고 보면 진행 중 표시를 지우고 요청을 다시 답 기다림으로 돌린다', async () => {
    state.lookup = payment([]);
    expect(await settleRequestedCancel(db, agreed, NOW)).toBe('cleared');
    expect(state.cleared).toEqual(['reservation-1']);
    expect(state.reopened).toEqual([{ reservationId: 'reservation-1', now: NOW }]);
  });

  it('고객 취소는 지워도 요청을 건드리지 않는다', async () => {
    state.lookup = payment([]);
    expect(await settleRequestedCancel(db, request, NOW)).toBe('cleared');
    expect(state.reopened).toEqual([]);
  });
});
