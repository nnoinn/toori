// 알림 보내기 (X-505-1, W16). 켜 둔 기기, 중복, 끝난 구독, 실패 기록을 본다. 푸시와 구독 저장은 가짜로 바꾼다. 실제 중복 막기는 notify.db.test.ts가 본다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { getDb } from '@/db';

const state = vi.hoisted(() => ({
  targets: [] as { endpoint: string }[],
  results: {} as Record<string, string>,
  sent: [] as [string, string][],
  deleted: [] as string[],
}));

vi.mock('./subscription-store', () => ({
  readPushTargets: async () => state.targets,
  deleteExpiredPushSubscription: async (_db: unknown, endpoint: string) => {
    state.deleted.push(endpoint);
  },
}));
vi.mock('./send-web-push', () => ({
  sendWebPush: async (target: { endpoint: string }, payload: string) => {
    state.sent.push([target.endpoint, payload]);
    return state.results[target.endpoint] ?? 'sent';
  },
}));

const { notify } = await import('./notify');

const INPUT = {
  userId: 'user-1',
  accountType: 'owner' as const,
  event: 'reservation.confirmed',
  dedupeKey: 'reservation.confirmed:owner:r-1',
  title: '새 예약이 들어왔어요',
  body: '커트 · 11/5(목) 15:00',
  url: '/owner/reservations/r-1',
};

/** insert와 update만 흉내 낸다. claimed가 false면 같은 dedupe_key가 이미 있는 것이다 */
function fakeDb(claimed = true) {
  const inserted: unknown[] = [];
  const updated: unknown[] = [];
  const db = {
    insert: () => ({
      values: (row: unknown) => {
        inserted.push(row);
        return {
          onConflictDoNothing: () => ({ returning: async () => (claimed ? [{ id: 'n-1' }] : []) }),
        };
      },
    }),
    update: () => ({
      set: (row: unknown) => {
        updated.push(row);
        return { where: async () => {} };
      },
    }),
  } as unknown as ReturnType<typeof getDb>;
  return { db, inserted, updated };
}

beforeEach(() => {
  state.targets = [{ endpoint: 'a' }, { endpoint: 'b' }];
  state.results = {};
  state.sent = [];
  state.deleted = [];
});

describe('notify', () => {
  it('켜 둔 기기마다 보내고 기록을 남긴다. 내용에 받는 계정 종류가 들어간다', async () => {
    const { db, inserted, updated } = fakeDb();
    await notify(db, INPUT);
    expect(inserted).toEqual([
      {
        userId: 'user-1',
        accountType: 'owner',
        event: 'reservation.confirmed',
        dedupeKey: 'reservation.confirmed:owner:r-1',
        channel: 'web_push',
        payload: { title: INPUT.title, body: INPUT.body, url: INPUT.url },
        status: 'sent',
      },
    ]);
    expect(state.sent.map(([endpoint]) => endpoint)).toEqual(['a', 'b']);
    expect(JSON.parse(state.sent[0][1])).toEqual({
      title: INPUT.title,
      body: INPUT.body,
      url: INPUT.url,
      account: 'owner',
    });
    expect(updated).toEqual([]);
  });

  it('켜 둔 기기가 없으면 기록도 남기지 않는다', async () => {
    state.targets = [];
    const { db, inserted } = fakeDb();
    await notify(db, INPUT);
    expect(inserted).toEqual([]);
    expect(state.sent).toEqual([]);
  });

  it('같은 dedupe_key가 이미 있으면 보내지 않는다', async () => {
    const { db, updated } = fakeDb(false);
    await notify(db, INPUT);
    expect(state.sent).toEqual([]);
    expect(updated).toEqual([]);
  });

  it('끝난 구독은 지운다. 다른 기기가 받았으면 sent 그대로다', async () => {
    state.results = { a: 'expired' };
    const { db, updated } = fakeDb();
    await notify(db, INPUT);
    expect(state.deleted).toEqual(['a']);
    expect(updated).toEqual([]);
  });

  it('한 기기도 못 받으면 failed로 바꾸고 다시 보내지 않는다', async () => {
    state.results = { a: 'expired', b: 'failed' };
    const { db, updated } = fakeDb();
    await notify(db, INPUT);
    expect(updated).toEqual([{ status: 'failed', error: 'expired,failed' }]);
    expect(state.sent).toHaveLength(2);
  });
});
