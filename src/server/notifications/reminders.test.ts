// 예약 리마인드 보내기 (C-602, W17 ①). 예약 읽기와 notify는 가짜로 바꾼다. 어떤 예약을 고르는지는 reminder-store.db.test.ts가 본다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { getDb } from '@/db';

import type { DueReminder } from './reminder-store';

const state = vi.hoisted(() => ({
  due: {} as Record<number, DueReminder[]>,
  reads: [] as Record<string, unknown>[],
  sent: [] as Record<string, unknown>[],
  failFor: null as string | null,
}));

vi.mock('./reminder-store', async (original) => ({
  ...(await original<typeof import('./reminder-store')>()),
  readDueReminders: async (_db: unknown, input: { minutes: number }) => {
    state.reads.push(input);
    return state.due[input.minutes] ?? [];
  },
}));
vi.mock('./notify', () => ({
  notify: async (_db: unknown, input: { userId: string }) => {
    if (input.userId === state.failFor) throw new Error('push down');
    state.sent.push(input);
  },
}));

const { reminderMessage, sendDueReminders } = await import('./reminders');

const db = {} as ReturnType<typeof getDb>;
const NOW = new Date('2026-11-12T04:00:00.000Z');
// 한국 시간 11/12(목) 15:00
const START = new Date('2026-11-12T06:00:00.000Z');

function reminder(id: string): DueReminder {
  return {
    reservationId: id,
    customerUserId: `user-${id}`,
    shopName: '투리 미용실',
    startAt: START,
  };
}

beforeEach(() => {
  state.due = {};
  state.reads = [];
  state.sent = [];
  state.failFor = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reminderMessage', () => {
  it('2시간 전은 날짜와 시각, 15분 전은 시각만 쓴다', () => {
    expect(reminderMessage(120, reminder('r'))).toEqual({
      title: '예약 2시간 전이에요',
      body: '투리 미용실 · 11/12(목) 15:00',
    });
    expect(reminderMessage(15, reminder('r'))).toEqual({
      title: '예약 15분 전이에요',
      body: '투리 미용실 · 15:00 시작',
    });
  });
});

describe('sendDueReminders', () => {
  it('2시간 전부터 보고, 다음 리마인드 때까지만 고른다', async () => {
    await sendDueReminders(db, NOW);
    expect(state.reads).toEqual([
      { minutes: 120, nextMinutes: 15, now: NOW, limit: 200 },
      { minutes: 15, nextMinutes: 0, now: NOW, limit: 200 },
    ]);
  });

  it('고객에게 예약 상세 주소로 보내고, 리마인드마다 따로 한 번만 가게 키를 나눈다', async () => {
    state.due = { 120: [reminder('a')], 15: [reminder('b')] };
    expect(await sendDueReminders(db, NOW)).toEqual({ due: 2, failed: 0 });
    expect(state.sent).toEqual([
      {
        userId: 'user-a',
        accountType: 'customer',
        event: 'reservation.reminder',
        dedupeKey: 'reservation.reminder:120m:customer:a',
        title: '예약 2시간 전이에요',
        body: '투리 미용실 · 11/12(목) 15:00',
        url: '/reservations/a',
      },
      {
        userId: 'user-b',
        accountType: 'customer',
        event: 'reservation.reminder',
        dedupeKey: 'reservation.reminder:15m:customer:b',
        title: '예약 15분 전이에요',
        body: '투리 미용실 · 15:00 시작',
        url: '/reservations/b',
      },
    ]);
  });

  it('한 건이 실패해도 나머지는 보내고 실패 수를 센다', async () => {
    state.due = { 120: Array.from({ length: 12 }, (_, i) => reminder(`r${i}`)) };
    state.failFor = 'user-r3';
    expect(await sendDueReminders(db, NOW)).toEqual({ due: 12, failed: 1 });
    expect(state.sent).toHaveLength(11);
    expect(console.error).toHaveBeenCalledWith('[notify] 리마인드 실패:', 'Error');
  });
});
