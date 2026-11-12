// 합의 후 취소 요청 정리 작업 (#320). 만료로 바꾼 요청마다 원장님에게 만료 알림을 보내고, 예약이 바뀐 요청을 끝남으로 바꾸는지 본다.
// DB 저장은 가짜로 바꾼다(실제 저장은 agreed-cancel-store.db.test.ts).

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { getDb } from '@/db';

const NOW = new Date('2026-11-12T03:00:00.000Z');
const state = vi.hoisted(() => ({
  expired: [] as { requestId: string; reservationId: string }[],
  sent: [] as unknown[],
  failOn: null as string | null,
  calls: [] as unknown[],
}));

vi.mock('./agreed-cancel-store', () => ({
  expireDueRequests: async (_db: unknown, input: unknown) => {
    state.calls.push(['expire', input]);
    return state.expired;
  },
  closeChangedRequests: async (_db: unknown, input: unknown) => {
    state.calls.push(['close', input]);
    return 3;
  },
}));
vi.mock('@/server/notifications/alerts', () => ({
  sendAgreedCancelResult: async (_db: unknown, input: { requestId: string }) => {
    if (input.requestId === state.failOn) throw new Error('push down');
    state.sent.push(input);
  },
}));

const { sweepAgreedCancelRequests } = await import('./agreed-cancel-expiry');
const db = 'db' as unknown as ReturnType<typeof getDb>;

beforeEach(() => {
  state.expired = [
    { requestId: 'request-1', reservationId: 'reservation-1' },
    { requestId: 'request-2', reservationId: 'reservation-2' },
  ];
  state.sent = [];
  state.failOn = null;
  state.calls = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('sweepAgreedCancelRequests', () => {
  it('만료로 바꾼 요청마다 원장님에게 만료 알림, 예약이 바뀐 요청은 끝남(알림 없음)', async () => {
    expect(await sweepAgreedCancelRequests(db, NOW)).toEqual({ expired: 2, closed: 3, failed: 0 });
    expect(state.calls).toEqual([
      ['expire', { now: NOW, limit: 200 }],
      ['close', { now: NOW }],
    ]);
    expect(state.sent).toEqual([
      { requestId: 'request-1', reservationId: 'reservation-1', result: 'expired' },
      { requestId: 'request-2', reservationId: 'reservation-2', result: 'expired' },
    ]);
  });

  it('알림 하나가 실패해도 나머지는 보내고 실패 수를 센다', async () => {
    state.failOn = 'request-1';
    expect(await sweepAgreedCancelRequests(db, NOW)).toEqual({ expired: 2, closed: 3, failed: 1 });
    expect(state.sent).toEqual([
      { requestId: 'request-2', reservationId: 'reservation-2', result: 'expired' },
    ]);
    expect(console.error).toHaveBeenCalled();
  });
});
