// 환불 미리보기·예약 취소 (연결 #9, #128, W14). 미리보기 숫자(calcRefund)와 취소의 순서·실패 코드를 본다.
// 로그인·DB·포트원·시각은 가짜로 바꿔서 DB 없이 돈다. 저장 내용과 내 예약만 읽는지는 refund-store.db.test.ts가 본다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';

import type { RefundTarget } from './refund-store';

const RESERVATION = '5d6e7f80-9a1b-4c2d-8e3f-405162738495';
const START = new Date('2026-11-01T06:00:00.000Z'); // 한국 시간 11/1 15:00
const HOUR = 60 * 60 * 1000;
const before = (hours: number) => new Date(START.getTime() - hours * HOUR);

const state = vi.hoisted(() => ({
  auth: null as unknown,
  now: new Date(),
  target: null as unknown,
  reads: [] as [string, string][],
  pgCalls: [] as unknown[][],
  pgResult: null as unknown,
  steps: [] as string[],
  requests: [] as Record<string, unknown>[],
  started: true as boolean | Error,
  cleared: [] as string[],
  clearError: null as Error | null,
  finishes: [] as unknown[][],
  finished: { refundAmount: 31_500 } as { refundAmount: number } | null | Error,
  lookups: [] as string[],
  lookup: { state: 'none' } as unknown,
}));

vi.mock('@/lib/request-time', () => ({ getRequestNow: async () => state.now }));
vi.mock('@/server/auth', () => ({ requireCustomer: async () => state.auth }));
vi.mock('@/db', () => ({
  getDb: () => ({ transaction: (run: (tx: string) => unknown) => run('tx') }),
}));
vi.mock('@/server/payments/portone', () => ({
  cancelPortOnePayment: async (...args: unknown[]) => {
    state.steps.push('portone');
    state.pgCalls.push(args);
    return state.pgResult;
  },
}));
vi.mock('./refund-store', () => ({
  readRefundTarget: async (reservationId: string, customerId: string) => {
    state.reads.push([reservationId, customerId]);
    return state.target;
  },
  requestCustomerCancel: async (_db: unknown, input: Record<string, unknown>) => {
    state.steps.push('request');
    state.requests.push(input);
    if (state.started instanceof Error) throw state.started;
    return state.started;
  },
  clearRequestedCancel: async (_db: unknown, reservationId: string) => {
    state.cleared.push(reservationId);
    if (state.clearError) throw state.clearError;
  },
}));
vi.mock('./finish-cancel', () => ({
  finishCancel: async (_db: unknown, ...args: unknown[]) => {
    state.steps.push('finish');
    state.finishes.push(args);
    if (state.finished instanceof Error) throw state.finished;
    return state.finished;
  },
  lookUpRefund: async (paymentId: string) => {
    state.lookups.push(paymentId);
    return state.lookup;
  },
}));

const { cancelReservation, previewRefund } = await import('./cancel');

function target(extra: Partial<RefundTarget> = {}): RefundTarget {
  return {
    reservationId: RESERVATION,
    orderId: 'order-1',
    slotId: 'slot-1',
    paymentId: 'toori-1',
    status: 'confirmed',
    paidAmount: 45_000,
    salePrice: 45_000,
    couponAmount: 0,
    startAt: START,
    requested: null,
    ...extra,
  };
}

beforeEach(() => {
  state.auth = ok({ userId: 'user-1', customerId: 'customer-1' });
  state.now = before(30);
  state.target = target();
  state.reads = [];
  state.pgCalls = [];
  state.pgResult = { ok: true, cancellationId: 'c-1', amount: 31_500 };
  state.steps = [];
  state.requests = [];
  state.started = true;
  state.cleared = [];
  state.clearError = null;
  state.finishes = [];
  state.finished = { refundAmount: 31_500 };
  state.lookups = [];
  state.lookup = { state: 'none' };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('previewRefund', () => {
  it('30시간 전: 70% 환불(settlement-examples.md 3장), 내 예약으로 읽는다', async () => {
    expect(await previewRefund(RESERVATION)).toEqual(
      ok({
        reservationId: RESERVATION,
        refundable: true,
        band: 'over_24h',
        penaltyRate: 30,
        paidAmount: 45_000,
        refundAmount: 31_500,
        penaltyAmount: 13_500,
        couponAmount: 0,
        startAt: START.toISOString(),
        serverNow: before(30).toISOString(),
      }),
    );
    expect(state.reads).toEqual([[RESERVATION, 'customer-1']]);
  });

  it('쿠폰을 쓴 결제는 실제 결제액 기준으로 환불하고 쓴 쿠폰을 알려준다', async () => {
    state.target = target({ paidAmount: 42_000, couponAmount: 3_000 });
    const result = await previewRefund(RESERVATION);
    expect(result.ok && result.data).toMatchObject({
      paidAmount: 42_000,
      refundAmount: 29_400,
      penaltyAmount: 12_600,
      couponAmount: 3_000,
    });
  });

  it('6~24시간 전이면 50%', async () => {
    state.now = before(10);
    const result = await previewRefund(RESERVATION);
    expect(result.ok && result.data).toMatchObject({
      refundable: true,
      band: '6h_to_24h',
      refundAmount: 22_500,
    });
  });

  it.each([
    ['6시간 미만', before(2)],
    ['시작 뒤', before(-1)],
  ])('%s이면 취소할 수 없다(refundable: false, 환불 0)', async (_, now) => {
    state.now = now;
    const result = await previewRefund(RESERVATION);
    expect(result.ok && result.data).toMatchObject({
      refundable: false,
      band: 'under_6h',
      refundAmount: 0,
    });
  });

  it('이용 완료한 예약도 시작 뒤라 취소할 수 없다', async () => {
    state.target = target({ status: 'completed' });
    state.now = before(-2);
    const result = await previewRefund(RESERVATION);
    expect(result.ok && result.data.refundable).toBe(false);
  });

  it('쿠폰으로 결제액이 0원이어도 시간 안이면 취소할 수 있다(돌려줄 돈만 0)', async () => {
    state.target = target({ salePrice: 3_000, paidAmount: 0, couponAmount: 3_000 });
    const result = await previewRefund(RESERVATION);
    expect(result.ok && result.data).toMatchObject({ refundable: true, refundAmount: 0 });
  });

  it('없거나 남의 예약이면 RESERVATION_NOT_FOUND, 취소된 예약이면 ALREADY_CANCELLED', async () => {
    state.target = null;
    const missing = await previewRefund(RESERVATION);
    expect(missing.ok === false && missing.error.code).toBe('RESERVATION_NOT_FOUND');

    state.target = target({ status: 'cancelled' });
    const cancelled = await previewRefund(RESERVATION);
    expect(cancelled.ok === false && cancelled.error.code).toBe('ALREADY_CANCELLED');
  });

  it('예약 id 모양이 아니면 DB를 보지 않고 RESERVATION_NOT_FOUND', async () => {
    const result = await previewRefund('not-a-uuid');
    expect(result.ok === false && result.error.code).toBe('RESERVATION_NOT_FOUND');
    expect(state.reads).toEqual([]);
  });

  it('로그인·고객 모드 실패는 그대로 돌려준다', async () => {
    state.auth = fail('WRONG_MODE', '고객 계정으로 바꿔서 이용해 주세요');
    expect(await previewRefund(RESERVATION)).toEqual(state.auth);
  });
});

describe('previewRefund (진행 중인 취소가 있을 때)', () => {
  it('새로 계산하지 않고 저장해 둔 금액을 보여준다(그 사이 구간이 바뀌어도)', async () => {
    state.now = before(10); // 지금 계산하면 50% 구간이다
    state.target = target({
      requested: {
        band: 'over_24h',
        penaltyRate: 30,
        refundAmount: 31_500,
        penaltyAmount: 13_500,
        requestedAt: before(30),
      },
    });
    const preview = await previewRefund(RESERVATION);
    expect(preview).toMatchObject({
      ok: true,
      data: { refundable: true, band: 'over_24h', penaltyRate: 30, refundAmount: 31_500 },
    });
  });
});

describe('cancelReservation', () => {
  const cancel = (expectedRefundAmount = 31_500) =>
    cancelReservation({ reservationId: RESERVATION, expectedRefundAmount });
  const codeOf = (result: Awaited<ReturnType<typeof cancelReservation>>) =>
    result.ok ? null : result.error.code;
  const requested = {
    band: 'over_24h' as const,
    penaltyRate: 30,
    refundAmount: 31_500,
    penaltyAmount: 13_500,
    requestedAt: before(30),
  };

  it('진행 중으로 먼저 저장하고, 포트원에서 환불액만 돌려준 뒤 기록을 끝낸다', async () => {
    expect(await cancel()).toEqual(
      ok({
        reservationId: RESERVATION,
        refundAmount: 31_500,
        cancelledAt: before(30).toISOString(),
      }),
    );
    expect(state.steps).toEqual(['request', 'portone', 'finish']);
    expect(state.reads).toEqual([[RESERVATION, 'customer-1']]);
    expect(state.requests).toEqual([
      { reservationId: RESERVATION, orderId: 'order-1', ...requested },
    ]);
    expect(state.pgCalls).toEqual([
      ['toori-1', '고객 예약 취소', { amount: 31_500, currentCancellableAmount: 45_000 }],
    ]);
    expect(state.finishes[0]).toEqual([
      expect.objectContaining({ reservationId: RESERVATION, paymentId: 'toori-1', ...requested }),
      { ok: true, cancellationId: 'c-1', amount: 31_500 },
      before(30),
    ]);
  });

  it('돌려준 금액이 계산과 달라 실제 금액으로 끝냈으면 그 금액을 돌려준다', async () => {
    state.finished = { refundAmount: 20_000 };
    expect(await cancel()).toMatchObject({ ok: true, data: { refundAmount: 20_000 } });
  });

  it('포트원이 거절했고 취소 내역이 없으면 진행 중 표시를 지우고 REFUND_FAILED', async () => {
    state.pgResult = { ok: false, reason: 'rejected' };
    expect(codeOf(await cancel())).toBe('REFUND_FAILED');
    expect(state.lookups).toEqual(['toori-1']);
    expect(state.cleared).toEqual([RESERVATION]);
    expect(state.finishes).toEqual([]);
  });

  it('포트원이 거절했어도 끝난 취소가 있으면 그 금액으로 끝내고 성공', async () => {
    state.pgResult = { ok: false, reason: 'rejected' };
    state.lookup = { state: 'refunded', refund: { cancellationId: 'c-9', amount: 31_500 } };
    expect(await cancel()).toEqual(
      ok({
        reservationId: RESERVATION,
        refundAmount: 31_500,
        cancelledAt: before(30).toISOString(),
      }),
    );
    expect(state.finishes[0]?.[1]).toEqual({ cancellationId: 'c-9', amount: 31_500 });
    expect(state.cleared).toEqual([]);
  });

  it('포트원이 거절했고 끝난 취소가 있는데 다른 요청이 먼저 끝냈으면 ALREADY_CANCELLED', async () => {
    state.pgResult = { ok: false, reason: 'rejected' };
    state.lookup = { state: 'refunded', refund: { cancellationId: 'c-9', amount: 31_500 } };
    state.finished = null;
    expect(codeOf(await cancel())).toBe('ALREADY_CANCELLED');
    expect(state.cleared).toEqual([]);
  });

  it('포트원이 거절했고 처리 중이거나 묻지 못하면 기록을 두고 CANCEL_FINISHING', async () => {
    state.pgResult = { ok: false, reason: 'rejected' };
    state.lookup = { state: 'pending' };
    expect(codeOf(await cancel())).toBe('CANCEL_FINISHING');
    expect(state.cleared).toEqual([]);
    expect(state.finishes).toEqual([]);
  });

  it('환불이 끝났으면 취소 내역을 다시 묻지 않는다', async () => {
    expect((await cancel()).ok).toBe(true);
    expect(state.lookups).toEqual([]);
  });

  it('진행 중 표시를 못 지워도 REFUND_FAILED(정리 작업이 지운다)', async () => {
    state.pgResult = { ok: false, reason: 'rejected' };
    state.clearError = new Error('연결 끊김');
    expect(codeOf(await cancel())).toBe('REFUND_FAILED');
    expect(console.error).toHaveBeenCalled();
  });

  it.each(['pending', 'unavailable'])(
    '환불 결과를 기다리거나 모르면(%s) 진행 중으로 두고 CANCEL_FINISHING',
    async (reason) => {
      state.pgResult = { ok: false, reason };
      expect(codeOf(await cancel())).toBe('CANCEL_FINISHING');
      expect(state.cleared).toEqual([]);
      expect(state.finishes).toEqual([]);
    },
  );

  it('환불 뒤 저장이 실패하면 CANCEL_FINISHING이고 "환불하지 못했어요"가 나오지 않는다', async () => {
    state.finished = new Error('연결 끊김');
    const result = await cancel();
    expect(codeOf(result)).toBe('CANCEL_FINISHING');
    expect(result.ok === false && result.error.message).not.toContain('환불하지 못했어요');
    expect(state.cleared).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });

  it('다른 요청이 먼저 기록을 끝냈으면 ALREADY_CANCELLED', async () => {
    state.finished = null;
    expect(codeOf(await cancel())).toBe('ALREADY_CANCELLED');
  });

  it('다른 요청이 같은 취소를 시작했으면(두 번 누름) 포트원을 부르지 않고 CANCEL_FINISHING', async () => {
    state.started = false;
    expect(codeOf(await cancel())).toBe('CANCEL_FINISHING');
    expect(state.pgCalls).toEqual([]);
  });

  it('취소 시작을 저장하지 못하면 포트원을 부르지 않고 REFUND_FAILED', async () => {
    state.started = new Error('연결 끊김');
    expect(codeOf(await cancel())).toBe('REFUND_FAILED');
    expect(state.pgCalls).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });

  describe('진행 중인 취소를 다시 누를 때', () => {
    it('새로 계산하지 않고 저장해 둔 금액으로 처리한다(그 사이 구간이 바뀌어도)', async () => {
      state.now = before(10); // 지금 계산하면 50% 구간이다
      state.target = target({ requested });
      expect(await cancel()).toEqual(
        ok({
          reservationId: RESERVATION,
          refundAmount: 31_500,
          cancelledAt: requested.requestedAt.toISOString(),
        }),
      );
      expect(state.requests).toEqual([]);
      expect(state.pgCalls[0][2]).toEqual({ amount: 31_500, currentCancellableAmount: 45_000 });
      expect(state.finishes[0][0]).toMatchObject({ band: 'over_24h', penaltyRate: 30 });
    });

    it('시작까지 6시간 미만으로 넘어갔어도 이미 시작한 취소는 끝낼 수 있다', async () => {
      state.now = before(3);
      state.target = target({ requested });
      expect((await cancel()).ok).toBe(true);
    });

    it('이용 완료한 예약이면 저장한 금액을 쓰지 않고 막는다', async () => {
      state.now = new Date(START.getTime() + HOUR);
      state.target = target({ status: 'completed', requested });
      expect(codeOf(await cancel())).toBe('NOT_REFUNDABLE');
      expect(state.pgCalls).toEqual([]);
    });
  });

  it('돌려줄 돈이 없으면(쿠폰 전액 결제) 포트원을 부르지 않고 기록을 끝낸다', async () => {
    state.target = target({ paidAmount: 0, couponAmount: 45_000 });
    state.finished = { refundAmount: 0 };
    expect((await cancel(0)).ok).toBe(true);
    expect(state.pgCalls).toEqual([]);
    expect(state.finishes[0][1]).toEqual({ ok: true, cancellationId: null, amount: 0 });
  });

  it.each(['seed_abc', 'scenario_user_abc'])(
    '시드·시나리오 주문(%s)은 포트원에 결제가 없어 부르지 않고 기록을 끝낸다',
    async (paymentId) => {
      state.target = target({ paymentId });
      expect((await cancel()).ok).toBe(true);
      expect(state.pgCalls).toEqual([]);
      expect(state.finishes[0][1]).toEqual({ ok: true, cancellationId: null, amount: 31_500 });
    },
  );

  it('모르는 결제 번호는 건너뛰지 않고 포트원에 묻는다', async () => {
    state.target = target({ paymentId: 'other_seed_abc' });
    state.pgResult = { ok: false, reason: 'rejected' };
    expect(codeOf(await cancel())).toBe('REFUND_FAILED');
    expect(state.pgCalls).toHaveLength(1);
  });

  it('6시간 미만·시작 뒤면 NOT_REFUNDABLE(서버도 막는다)', async () => {
    for (const now of [before(2), before(-1)]) {
      state.now = now;
      const result = await cancelReservation({
        reservationId: RESERVATION,
        expectedRefundAmount: 0,
      });
      expect(result.ok === false && result.error.code).toBe('NOT_REFUNDABLE');
    }
  });

  it('미리보기 뒤 구간이 바뀌었으면 REFUND_CHANGED와 새 미리보기', async () => {
    state.now = before(10); // 미리보기는 30시간 전(31,500원)에 봤는데 지금은 10시간 전
    const result = await cancelReservation({
      reservationId: RESERVATION,
      expectedRefundAmount: 31_500,
    });
    expect(result.ok === false && result.error).toMatchObject({
      code: 'REFUND_CHANGED',
      preview: { band: '6h_to_24h', refundAmount: 22_500 },
    });
  });

  it('없거나 남의 예약, 이미 취소된 예약', async () => {
    state.target = null;
    const missing = await cancelReservation({
      reservationId: RESERVATION,
      expectedRefundAmount: 31_500,
    });
    expect(missing.ok === false && missing.error.code).toBe('RESERVATION_NOT_FOUND');

    state.target = target({ status: 'cancelled' });
    const cancelled = await cancelReservation({
      reservationId: RESERVATION,
      expectedRefundAmount: 31_500,
    });
    expect(cancelled.ok === false && cancelled.error.code).toBe('ALREADY_CANCELLED');
  });

  it.each([
    ['예약 id 모양', { reservationId: 'x', expectedRefundAmount: 0 }],
    ['음수 금액', { reservationId: RESERVATION, expectedRefundAmount: -1 }],
    ['소수 금액', { reservationId: RESERVATION, expectedRefundAmount: 10.5 }],
  ])('%s → INVALID_INPUT', async (_, input) => {
    const result = await cancelReservation(input);
    expect(result.ok === false && result.error.code).toBe('INVALID_INPUT');
    expect(state.reads).toEqual([]);
  });

  it('로그인·고객 모드 실패는 그대로 돌려준다', async () => {
    state.auth = fail('UNAUTHENTICATED', '로그인이 필요해요');
    expect(
      await cancelReservation({ reservationId: RESERVATION, expectedRefundAmount: 31_500 }),
    ).toEqual(state.auth);
  });
});
