// 진행 중으로 남은 고객 취소 정리 (W14, #222). 고르는 기준과 결과 세기, 한 건이 실패해도 계속하는지 본다.

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { getDb } from '@/db';

const state = vi.hoisted(() => ({
  stale: [] as { reservationId: string }[],
  reads: [] as unknown[],
  results: {} as Record<string, string | Error>,
}));

vi.mock('@/server/policy', () => ({ ORDER_SWEEP_BATCH: 20, STALE_CANCEL_MINUTES: 5 }));
vi.mock('./refund-store', () => ({
  readStaleCancels: async (_db: unknown, input: unknown) => {
    state.reads.push(input);
    return state.stale;
  },
}));
vi.mock('./finish-cancel', () => ({
  settleRequestedCancel: async (_db: unknown, request: { reservationId: string }) => {
    const result = state.results[request.reservationId];
    if (result instanceof Error) throw result;
    return result;
  },
}));

const { sweepStaleCancels } = await import('./sweep-cancels');

const db = {} as ReturnType<typeof getDb>;
const NOW = new Date('2026-11-04T00:20:00.000Z');

beforeEach(() => {
  state.stale = [];
  state.reads = [];
  state.results = {};
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('5분 넘은 진행 중 취소를 20건까지 읽는다', async () => {
  expect(await sweepStaleCancels(db, NOW)).toEqual({
    checked: 0,
    finished: 0,
    cleared: 0,
    left: 0,
  });
  expect(state.reads).toEqual([
    { requestedBefore: new Date('2026-11-04T00:15:00.000Z'), limit: 20 },
  ]);
});

it('결과를 세고, 한 건이 실패해도 나머지를 계속한다', async () => {
  state.stale = ['a', 'b', 'c', 'd'].map((reservationId) => ({ reservationId }));
  state.results = { a: 'finished', b: new Error('연결 끊김'), c: 'cleared', d: 'left' };
  expect(await sweepStaleCancels(db, NOW)).toEqual({
    checked: 4,
    finished: 1,
    cleared: 1,
    left: 2,
  });
  expect(console.error).toHaveBeenCalledTimes(1);
});
