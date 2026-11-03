// 포트원 웹훅 처리 (X-204, W13). 웹훅 종류와 주문 상태별로 무엇을 하는지, 언제 다시 보내게 하는지 본다.
// 저장과 포트원은 가짜로 바꿔서 DB 없이 돈다. 저장은 webhook-store.db.test.ts, 취소 맞추기는 sync-cancel.test.ts가 본다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { getDb } from '@/db';

const state = vi.hoisted(() => ({
  fresh: true,
  begun: [] as Record<string, unknown>[],
  finished: [] as Record<string, unknown>[],
  order: null as unknown,
  lookup: null as unknown,
  lookups: [] as string[],
  applied: 'confirmed' as string,
  applyCalls: [] as unknown[],
  autoCancel: true,
  autoCancelCalls: [] as unknown[],
  sync: 'cancel_recorded' as string,
  syncCalls: [] as unknown[][],
}));

vi.mock('./webhook-store', () => ({
  beginWebhookEvent: async (_db: unknown, event: Record<string, unknown>) => {
    state.begun.push(event);
    return state.fresh;
  },
  finishWebhookEvent: async (_db: unknown, input: Record<string, unknown>) => {
    state.finished.push(input);
  },
}));
vi.mock('./order-store', () => ({ readOrderByPaymentId: async () => state.order }));
vi.mock('./portone', async (original) => ({
  ...(await original<typeof import('./portone')>()),
  getPortOnePayment: async (paymentId: string) => {
    state.lookups.push(paymentId);
    return state.lookup;
  },
}));
vi.mock('./payment-status', () => ({
  applyPaymentStatus: async (_db: unknown, order: unknown) => {
    state.applyCalls.push(order);
    return state.applied;
  },
}));
vi.mock('./settle-order', () => ({
  autoCancelOrder: async (_db: unknown, order: unknown) => {
    state.autoCancelCalls.push(order);
    return state.autoCancel;
  },
}));
vi.mock('@/server/refunds/sync-cancel', () => ({
  syncUnrecordedCancel: async (_db: unknown, ...args: unknown[]) => {
    state.syncCalls.push(args);
    return state.sync;
  },
}));

const { handlePortOneWebhook } = await import('./webhook');
const { ABANDONED_ORDER_CODE } = await import('./errors');

const db = 'db' as unknown as ReturnType<typeof getDb>;
const NOW = new Date('2026-11-03T12:00:00.000Z');

function order(status: string, failureCode: string | null = null) {
  return { orderId: 'order-1', paymentId: 'toori-1', amount: 17_500, status, failureCode };
}

function paid(cancellations: { id: string; amount: number }[] = []) {
  return {
    ok: true,
    payment: { status: 'PAID', cancellations, cancelInProgress: false },
  };
}

function handle(type: string, paymentId: string | undefined = 'toori-1') {
  return handlePortOneWebhook(
    db,
    { webhookId: 'msg-1', payload: { type, timestamp: 'x', data: { paymentId } } },
    NOW,
  );
}

/** 처리 끝으로 기록한 결과 */
const recorded = () => state.finished.map((event) => event.result);

beforeEach(() => {
  state.fresh = true;
  state.begun = [];
  state.finished = [];
  state.order = order('pending');
  state.lookup = paid();
  state.lookups = [];
  state.applied = 'confirmed';
  state.applyCalls = [];
  state.autoCancel = true;
  state.autoCancelCalls = [];
  state.sync = 'cancel_recorded';
  state.syncCalls = [];
});

describe('handlePortOneWebhook', () => {
  it('받은 웹훅을 종류와 내용까지 기록하고, 끝나면 결과를 남긴다', async () => {
    expect(await handle('Transaction.Paid')).toBe('done');
    expect(state.begun[0]).toMatchObject({
      webhookId: 'msg-1',
      type: 'Transaction.Paid',
      payload: { data: { paymentId: 'toori-1' } },
      now: NOW,
    });
    expect(state.finished).toEqual([{ webhookId: 'msg-1', result: 'confirmed', now: NOW }]);
  });

  it('처리를 끝낸 웹훅이 다시 오면 아무것도 하지 않는다', async () => {
    state.fresh = false;
    expect(await handle('Transaction.Paid')).toBe('done');
    expect(state.lookups).toEqual([]);
    expect(state.finished).toEqual([]);
  });

  it.each([
    'Transaction.Ready',
    'Transaction.PayPending',
    'Transaction.CancelPending',
    'Transaction.DisputeCreated',
    'BillingKey.Issued',
    '앞으로 생길 종류',
  ])('처리하지 않는 종류(%s)는 기록만 한다', async (type) => {
    expect(await handle(type)).toBe('done');
    expect(state.lookups).toEqual([]);
    expect(recorded()).toEqual(['ignored']);
  });

  it('내용 모양이 달라도 기록만 하고 200으로 끝낸다', async () => {
    const outcome = await handlePortOneWebhook(db, { webhookId: 'msg-1', payload: [1] }, NOW);
    expect(outcome).toBe('done');
    expect(state.begun[0]).toMatchObject({ type: 'unknown' });
    expect(recorded()).toEqual(['ignored']);
  });

  it('결제 번호가 없으면 기록만 한다', async () => {
    await handlePortOneWebhook(
      db,
      { webhookId: 'msg-1', payload: { type: 'Transaction.Paid', data: {} } },
      NOW,
    );
    expect(state.lookups).toEqual([]);
    expect(recorded()).toEqual(['ignored']);
  });

  it('우리 주문이 아니면 포트원에 묻지 않는다', async () => {
    state.order = null;
    expect(await handle('Transaction.Paid')).toBe('done');
    expect(state.lookups).toEqual([]);
    expect(recorded()).toEqual(['no_order']);
  });

  it('포트원에 묻지 못하면 끝으로 기록하지 않고 다시 보내게 한다', async () => {
    state.lookup = { ok: false, reason: 'unavailable' };
    expect(await handle('Transaction.Paid')).toBe('retry');
    expect(state.finished).toEqual([]);
  });

  it('포트원에 결제가 없으면 끝낸다', async () => {
    state.lookup = { ok: false, reason: 'not_found' };
    expect(await handle('Transaction.Paid')).toBe('done');
    expect(recorded()).toEqual(['no_payment']);
  });

  describe('결제 대기 주문', () => {
    it.each(['Transaction.Paid', 'Transaction.Failed', 'Transaction.Cancelled'])(
      '%s면 웹훅 내용이 아니라 포트원 상태로 정한다',
      async (type) => {
        await handle(type);
        expect(state.lookups).toEqual(['toori-1']);
        expect(state.applyCalls).toEqual([state.order]);
      },
    );

    it('정리 작업이 결제 안 함으로 둔 주문도 같은 길로 간다(그 뒤 결제된 경우)', async () => {
      state.order = order('failed', ABANDONED_ORDER_CODE);
      expect(await handle('Transaction.Paid')).toBe('done');
      expect(state.applyCalls).toEqual([state.order]);
      expect(recorded()).toEqual(['confirmed']);
    });

    it('결과를 정하지 못하면 다시 보내게 한다', async () => {
      state.applied = 'left';
      expect(await handle('Transaction.Paid')).toBe('retry');
      expect(state.finished).toEqual([]);
    });
  });

  describe('자동 취소를 끝내지 못한 주문(paid)', () => {
    it('자동 취소를 이어서 한다', async () => {
      state.order = order('paid');
      expect(await handle('Transaction.Paid')).toBe('done');
      expect(state.autoCancelCalls).toEqual([state.order]);
      expect(state.lookups).toEqual([]);
      expect(recorded()).toEqual(['autoCancelled']);
    });

    it('이번에도 끝내지 못하면 다시 보내게 한다', async () => {
      state.order = order('paid');
      state.autoCancel = false;
      expect(await handle('Transaction.Paid')).toBe('retry');
    });
  });

  describe('확정된 주문', () => {
    it('끝난 취소가 없으면 바꾸지 않는다(결제 완료 웹훅이 뒤늦게 옴)', async () => {
      state.order = order('confirmed');
      expect(await handle('Transaction.Paid')).toBe('done');
      expect(state.applyCalls).toEqual([]);
      expect(state.syncCalls).toEqual([]);
      expect(recorded()).toEqual(['settled']);
    });

    it('끝난 취소가 있으면 기록과 맞춘다', async () => {
      state.order = order('confirmed');
      state.lookup = paid([{ id: 'c-1', amount: 12_250 }]);
      expect(await handle('Transaction.PartialCancelled')).toBe('done');
      expect(state.syncCalls).toEqual([
        ['order-1', { cancellationId: 'c-1', amount: 12_250 }, NOW],
      ]);
      expect(recorded()).toEqual(['cancel_recorded']);
    });

    it('진행 중인 취소가 있으면 다시 보내게 한다', async () => {
      state.order = order('confirmed');
      state.lookup = paid([{ id: 'c-1', amount: 12_250 }]);
      state.sync = 'retry';
      expect(await handle('Transaction.PartialCancelled')).toBe('retry');
      expect(state.finished).toEqual([]);
    });
  });

  it.each([
    ['failed', 'PAY_PROCESS_CANCELED'],
    ['auto_cancelled', null],
  ])('결과가 정해진 주문(%s)은 포트원에 묻지 않는다', async (status, code) => {
    state.order = order(status, code);
    expect(await handle('Transaction.Cancelled')).toBe('done');
    expect(state.lookups).toEqual([]);
    expect(recorded()).toEqual(['settled']);
  });
});
