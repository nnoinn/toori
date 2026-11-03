// 우리 기록에 없는 포트원 취소 맞추기 (X-204, W13, #222). 예약 상태별로 무엇을 하는지 본다. 저장 내용은 refund-store.db.test.ts가 본다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { getDb } from '@/db';

import type { RefundTarget } from './refund-store';

const state = vi.hoisted(() => ({
  target: null as unknown,
  finishes: [] as unknown[][],
  finished: { refundAmount: 12_250 } as { refundAmount: number } | null,
}));

vi.mock('./refund-store', () => ({ readRefundTargetByOrder: async () => state.target }));
vi.mock('./finish-cancel', () => ({
  finishCancel: async (_db: unknown, ...args: unknown[]) => {
    state.finishes.push(args);
    return state.finished;
  },
}));

const { syncUnrecordedCancel } = await import('./sync-cancel');

const db = 'db' as unknown as ReturnType<typeof getDb>;
const START = new Date('2026-11-05T06:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const NOW = new Date(START.getTime() - 30 * HOUR);
const REFUND = { cancellationId: 'c-1', amount: 12_250 };

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
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('syncUnrecordedCancel', () => {
  it('예약이 예정이면 지금 시각으로 계산해 끝내고 운영자 확인 메모와 로그를 남긴다', async () => {
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
  });

  it('진행 중인 취소가 있으면 끝내지 않고 다시 보내게 한다', async () => {
    state.target = target({
      requested: {
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
