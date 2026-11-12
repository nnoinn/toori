// 우리 기록에 없는 포트원 취소 맞추기 (X-204, W13, #222, #248). 예약 상태와 취소 사유별로 무엇을 하는지 본다. 저장 내용은 refund-store.db.test.ts가 본다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { getDb } from '@/db';

import type { RefundTarget } from './refund-store';

const state = vi.hoisted(() => ({
  target: null as unknown,
  finishes: [] as unknown[][],
  finished: { refundAmount: 12_250 } as { refundAmount: number } | null,
  adminCancels: [] as unknown[],
  adminFinished: true,
  cancelAlerts: [] as unknown[],
}));

vi.mock('@/server/notifications/alerts', () => ({
  notifyReservationCancelled: (
    _db: unknown,
    reservationId: string,
    options: { by: string; now: Date },
  ) => {
    state.cancelAlerts.push({ reservationId, ...options });
  },
}));

vi.mock('./refund-store', () => ({
  readRefundTargetByOrder: async () => state.target,
  finishAdminCancel: async (_tx: unknown, input: unknown) => {
    state.adminCancels.push(input);
    return state.adminFinished;
  },
}));
vi.mock('./finish-cancel', () => ({
  finishCancel: async (_db: unknown, ...args: unknown[]) => {
    state.finishes.push(args);
    return state.finished;
  },
}));

const { isAppCustomerCancel, syncUnrecordedCancel } = await import('./sync-cancel');

const db = {
  transaction: async (run: (tx: unknown) => unknown) => run('tx'),
} as unknown as ReturnType<typeof getDb>;
const START = new Date('2026-11-05T06:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const NOW = new Date(START.getTime() - 30 * HOUR);
const REFUND = { cancellationId: 'c-1', amount: 12_250, reasons: ['고객 예약 취소'] };
const CONSOLE = { cancellationId: 'c-9', amount: 17_500, reasons: ['콘솔에서 취소'] };

function target(extra: Partial<RefundTarget> = {}): RefundTarget {
  return {
    reservationId: 'reservation-1',
    orderId: 'order-1',
    slotId: 'slot-1',
    paymentId: 'toori-1',
    status: 'confirmed',
    paidAmount: 17_500,
    salePrice: 17_500,
    couponAmount: 0,
    startAt: START,
    requested: null,
    ...extra,
  };
}

beforeEach(() => {
  state.target = target();
  state.finishes = [];
  state.finished = { refundAmount: 12_250 };
  state.adminCancels = [];
  state.adminFinished = true;
  state.cancelAlerts = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('syncUnrecordedCancel', () => {
  it('앱이 보낸 고객 취소를 포트원이 나중에 처리했으면 고객 취소로 계산해 끝내고 메모와 로그를 남긴다', async () => {
    expect(await syncUnrecordedCancel(db, 'order-1', REFUND, NOW)).toBe('cancel_recorded');
    const [request, refund, now, note] = state.finishes[0];
    expect(request).toMatchObject({
      reservationId: 'reservation-1',
      band: 'over_24h',
      penaltyRate: 30,
      refundAmount: 12_250,
      penaltyAmount: 5_250,
      requestedAt: NOW,
    });
    expect(refund).toEqual(REFUND);
    expect(now).toBe(NOW);
    expect(note).toBeTruthy();
    expect(console.error).toHaveBeenCalled();
    expect(state.adminCancels).toEqual([]);
  });

  it('앱을 거치지 않은 취소는 운영자 취소로 실제 환불액을 남긴다(전액이면 확인 이유 없음)', async () => {
    expect(await syncUnrecordedCancel(db, 'order-1', CONSOLE, NOW)).toBe('cancel_recorded');
    expect(state.finishes).toEqual([]);
    expect(state.adminCancels).toEqual([
      {
        reservationId: 'reservation-1',
        orderId: 'order-1',
        slotId: 'slot-1',
        paidAmount: 17_500,
        refundAmount: 17_500,
        pgCancellationId: 'c-9',
        reviewReason: null,
        hoursBeforeStart: 30,
        now: NOW,
      },
    ]);
    expect(console.error).toHaveBeenCalled();
    // 운영자 취소 알림: 원장님과 고객 모두(11/10 #293). 고객 취소 쪽 알림은 finishCancel이 보낸다
    expect(state.cancelAlerts).toEqual([{ reservationId: 'reservation-1', by: 'admin', now: NOW }]);
  });

  it('운영자 취소가 일부만 돌려줬으면 확인 이유를 남긴다', async () => {
    await syncUnrecordedCancel(db, 'order-1', { ...CONSOLE, amount: 10_000 }, NOW);
    expect(state.adminCancels[0]).toMatchObject({
      refundAmount: 10_000,
      reviewReason: expect.stringContaining('17500원 중 10000원'),
    });
  });

  it('운영자 취소 금액을 모르면 결제액으로 남기고 확인 이유를 남긴다', async () => {
    await syncUnrecordedCancel(db, 'order-1', { ...CONSOLE, amount: null }, NOW);
    expect(state.adminCancels[0]).toMatchObject({
      refundAmount: 17_500,
      reviewReason: expect.stringContaining('알 수 없어서'),
    });
  });

  it('이미 바뀐 예약이면 운영자 취소도 cancel_known이고 알림을 부르지 않는다', async () => {
    state.adminFinished = false;
    expect(await syncUnrecordedCancel(db, 'order-1', CONSOLE, NOW)).toBe('cancel_known');
    expect(state.cancelAlerts).toEqual([]);
  });

  it('진행 중인 취소가 있으면 끝내지 않고 다시 보내게 한다', async () => {
    state.target = target({
      requested: {
        reason: 'customer_cancel',
        band: 'over_24h',
        penaltyRate: 30,
        refundAmount: 12_250,
        penaltyAmount: 5_250,
        requestedAt: NOW,
      },
    });
    expect(await syncUnrecordedCancel(db, 'order-1', REFUND, NOW)).toBe('retry');
    expect(state.finishes).toEqual([]);
  });

  it('이미 취소된 예약이면 바꾸지 않고 로그도 남기지 않는다(정상 취소 뒤에 온 웹훅)', async () => {
    state.target = target({ status: 'cancelled' });
    expect(await syncUnrecordedCancel(db, 'order-1', REFUND, NOW)).toBe('cancel_known');
    expect(state.finishes).toEqual([]);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('이용 완료한 예약이면 바꾸지 않고 로그만 남긴다', async () => {
    state.target = target({ status: 'completed' });
    expect(await syncUnrecordedCancel(db, 'order-1', REFUND, NOW)).toBe('cancel_known');
    expect(state.finishes).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });

  it('예약이 없으면 바꾸지 않고 로그를 남긴다', async () => {
    state.target = null;
    expect(await syncUnrecordedCancel(db, 'order-1', REFUND, NOW)).toBe('cancel_known');
    expect(console.error).toHaveBeenCalled();
  });

  it('먼저 기록한 요청이 있으면 cancel_known', async () => {
    state.finished = null;
    expect(await syncUnrecordedCancel(db, 'order-1', REFUND, NOW)).toBe('cancel_known');
  });
});

describe('isAppCustomerCancel', () => {
  it('끝난 취소가 모두 앱이 보낸 고객 취소일 때만 true', () => {
    expect(isAppCustomerCancel(REFUND)).toBe(true);
    expect(isAppCustomerCancel({ ...REFUND, reasons: ['고객 예약 취소', '고객 예약 취소'] })).toBe(
      true,
    );
    expect(isAppCustomerCancel({ ...REFUND, reasons: ['고객 예약 취소', '콘솔에서 취소'] })).toBe(
      false,
    );
    expect(isAppCustomerCancel({ ...REFUND, reasons: [null] })).toBe(false);
    expect(isAppCustomerCancel({ ...REFUND, reasons: [] })).toBe(false);
  });
});
