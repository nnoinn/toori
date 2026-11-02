// 결제 완료를 확인한 주문의 처리 (W12, C-406). 확정·자동 취소 저장과 포트원 취소는 가짜로 바꿔서 순서와 넘기는 값을 본다.
// 실제 저장은 confirm-store.db.test.ts, 포트원 응답별 처리는 portone.test.ts가 본다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { getDb } from '@/db';

import type { ConfirmOutcome } from './confirm-store';
import type { PortOneCancel, PortOnePayment } from './portone';
import { autoCancelOrder, settlePaidOrder } from './settle-order';

const state = vi.hoisted(() => ({
  calls: [] as unknown[][],
  confirm: null as unknown,
  cancel: null as unknown,
}));

vi.mock('./confirm-store', () => ({
  confirmPaidOrder: async (tx: unknown, input: unknown) => {
    state.calls.push(['confirm', tx, input]);
    return state.confirm;
  },
  recordOrderOutcome: async (db: unknown, orderId: string, outcome: unknown) => {
    state.calls.push(['outcome', db, orderId, outcome]);
    return true;
  },
  recordAutoCancel: async (tx: unknown, input: unknown) => {
    state.calls.push(['autoCancel', tx, input]);
    return true;
  },
}));
vi.mock('./portone', () => ({
  cancelPortOnePayment: async (paymentId: string, reason: string) => {
    state.calls.push(['cancel', paymentId, reason]);
    return state.cancel;
  },
}));

const NOW = new Date('2026-11-01T03:00:00.000Z');
const PAID_AT = new Date('2026-11-01T03:05:00.000Z');
const db = {
  transaction: (run: (tx: string) => unknown) => run('tx'),
} as unknown as ReturnType<typeof getDb>;
const ORDER = { orderId: 'order-1', paymentId: 'toori-1', amount: 23_450 };
const REASON = '예약을 확정하지 못해 자동 취소';

const payment = (extra: Partial<PortOnePayment> = {}): PortOnePayment => ({
  status: 'PAID',
  amountTotal: 23_450,
  currency: 'KRW',
  paidAt: PAID_AT,
  method: 'PaymentMethodCard',
  failureReason: null,
  failureCode: null,
  cancellations: [],
  ...extra,
});
const names = () => state.calls.map((call) => call[0]);

beforeEach(() => {
  state.calls = [];
  state.confirm = {
    ok: true,
    reservationId: 'reservation-1',
    reservationCode: 'ABCD2345',
  } satisfies ConfirmOutcome;
  state.cancel = { ok: true, cancellationId: 'c-1', amount: 23_450 } satisfies PortOneCancel;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('settlePaidOrder', () => {
  it('금액이 맞고 확정할 수 있으면 트랜잭션 안에서 확정하고 취소하지 않는다', async () => {
    expect(await settlePaidOrder(db, ORDER, payment(), NOW)).toEqual(state.confirm);
    expect(state.calls).toEqual([
      [
        'confirm',
        'tx',
        { orderId: 'order-1', pgStatus: 'PAID', payMethod: 'PaymentMethodCard', paidAt: PAID_AT },
      ],
    ]);
  });

  it('결제 시각을 모르면 지금 시각으로 확정을 판단한다', async () => {
    await settlePaidOrder(db, ORDER, payment({ paidAt: null }), NOW);
    expect(state.calls[0][2]).toMatchObject({ paidAt: NOW });
  });

  it('확정할 수 없으면 확정 저장이 끝난 뒤 포트원에서 취소하고 기록한다', async () => {
    state.confirm = { ok: false, code: 'HOLD_EXPIRED' } satisfies ConfirmOutcome;
    expect(await settlePaidOrder(db, ORDER, payment(), NOW)).toEqual({
      ok: false,
      code: 'HOLD_EXPIRED',
      autoCancelled: true,
    });
    expect(names()).toEqual(['confirm', 'cancel', 'autoCancel']);
  });

  it.each([
    ['금액이 다름', { amountTotal: 100 }],
    ['금액을 모름', { amountTotal: null }],
    ['원화가 아님', { currency: 'USD' }],
  ])('%s: 확정하지 않고 결제 확인(paid)으로 기록한 뒤 취소한다', async (_, extra) => {
    const paid = payment(extra);
    expect(await settlePaidOrder(db, ORDER, paid, NOW)).toEqual({
      ok: false,
      code: 'AMOUNT_MISMATCH',
      autoCancelled: true,
    });
    expect(names()).toEqual(['outcome', 'cancel', 'autoCancel']);
    expect(state.calls[0][3]).toEqual({
      status: 'paid',
      pgStatus: 'PAID',
      payMethod: 'PaymentMethodCard',
      paidAt: PAID_AT,
      failureCode: 'AMOUNT_MISMATCH',
    });
  });

  it('취소를 끝내지 못하면 autoCancelled false', async () => {
    state.confirm = { ok: false, code: 'SLOT_SOLD' } satisfies ConfirmOutcome;
    state.cancel = { ok: false, reason: 'unavailable' } satisfies PortOneCancel;
    expect(await settlePaidOrder(db, ORDER, payment(), NOW)).toEqual({
      ok: false,
      code: 'SLOT_SOLD',
      autoCancelled: false,
    });
  });
});

describe('autoCancelOrder', () => {
  it('포트원 취소 번호와 실제 환불액을 트랜잭션 안에서 기록한다', async () => {
    expect(await autoCancelOrder(db, ORDER, NOW)).toBe(true);
    expect(state.calls).toEqual([
      ['cancel', 'toori-1', REASON],
      [
        'autoCancel',
        'tx',
        { orderId: 'order-1', refundAmount: 23_450, pgCancellationId: 'c-1', now: NOW },
      ],
    ]);
  });

  it.each(['pending', 'unavailable'] as const)(
    '취소가 %s이면 기록하지 않고 false',
    async (reason) => {
      state.cancel = { ok: false, reason } satisfies PortOneCancel;
      expect(await autoCancelOrder(db, ORDER, NOW)).toBe(false);
      expect(names()).toEqual(['cancel']);
    },
  );

  it('다른 요청이 먼저 기록해도(recordAutoCancel false) 취소는 끝난 것이라 true', async () => {
    const confirmStore = await import('./confirm-store');
    vi.spyOn(confirmStore, 'recordAutoCancel').mockResolvedValueOnce(false);
    expect(await autoCancelOrder(db, ORDER, NOW)).toBe(true);
  });
});
