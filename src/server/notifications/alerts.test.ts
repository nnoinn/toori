// 이벤트별 알림 (연결 #12, #131). 받는 사람, 문구, 주소, 응답 뒤에 보내는지, 실패해도 던지지 않는지 본다. notify는 가짜로 바꾼다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { getDb } from '@/db';

const state = vi.hoisted(() => ({
  afterTasks: [] as (() => Promise<void>)[],
  notified: [] as unknown[],
  row: null as unknown,
  notifyError: null as Error | null,
}));

vi.mock('next/server', () => ({
  after: (task: () => Promise<void>) => {
    state.afterTasks.push(task);
  },
}));
vi.mock('./notify', () => ({
  notify: async (_db: unknown, input: unknown) => {
    if (state.notifyError) throw state.notifyError;
    state.notified.push(input);
  },
}));

const { notifyReservationConfirmed } = await import('./alerts');

/** 어떤 조인이든 where에서 state.row를 돌려주는 가짜 */
const db = (() => {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: async () => (state.row ? [state.row] : []),
  };
  return { select: () => chain } as unknown as ReturnType<typeof getDb>;
})();

const runAfterTasks = () => Promise.all(state.afterTasks.map((task) => task()));

beforeEach(() => {
  state.afterTasks = [];
  state.notified = [];
  state.notifyError = null;
  state.row = {
    customerUserId: 'customer-user',
    ownerUserId: 'owner-user',
    shopName: '샘플 헤어',
    menuName: '커트',
    startAt: new Date('2026-11-05T06:00:00.000Z'),
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('notifyReservationConfirmed', () => {
  it('응답을 보낸 뒤에 보낸다', () => {
    notifyReservationConfirmed(db, 'r-1');
    expect(state.afterTasks).toHaveLength(1);
    expect(state.notified).toEqual([]);
  });

  it('고객과 원장님에게 각자의 문구와 주소로 보낸다(#131 표)', async () => {
    notifyReservationConfirmed(db, 'r-1');
    await runAfterTasks();
    expect(state.notified).toEqual([
      {
        userId: 'customer-user',
        accountType: 'customer',
        event: 'reservation.confirmed',
        dedupeKey: 'reservation.confirmed:customer:r-1',
        title: '예약이 확정됐어요',
        body: '샘플 헤어 · 11/5(목) 15:00',
        url: '/reservations/r-1',
      },
      {
        userId: 'owner-user',
        accountType: 'owner',
        event: 'reservation.confirmed',
        dedupeKey: 'reservation.confirmed:owner:r-1',
        title: '새 예약이 들어왔어요',
        body: '커트 · 11/5(목) 15:00',
        url: '/owner/reservations/r-1',
      },
    ]);
  });

  it('예약이 없으면 보내지 않는다', async () => {
    state.row = null;
    notifyReservationConfirmed(db, 'r-1');
    await runAfterTasks();
    expect(state.notified).toEqual([]);
  });

  it('알림이 실패해도 던지지 않고 로그만 남긴다', async () => {
    state.notifyError = new Error('r-1 저장 실패');
    notifyReservationConfirmed(db, 'r-1');
    await expect(runAfterTasks()).resolves.toBeDefined();
    expect(console.error).toHaveBeenCalledWith(
      '[notify] 알림 실패:',
      'reservation.confirmed',
      'Error',
    );
  });
});
