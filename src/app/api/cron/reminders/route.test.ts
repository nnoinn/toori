// 예약 리마인드 주소 (W17 ①, 합의 후 취소 정리 #320). CRON_SECRET이 맞을 때만 리마인드와 합의 후 취소 정리를 하는지 본다.
// 보내기·정리 자체는 reminders.test.ts·agreed-cancel-expiry.test.ts가 본다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = new Date('2026-11-12T04:00:00.000Z');
const SUMMARY = { due: 3, failed: 1 };
const SWEEP = { expired: 2, closed: 1, failed: 0 };
const state = vi.hoisted(() => ({ send: vi.fn(), sweep: vi.fn() }));

vi.mock('@/db', () => ({ getDb: () => 'db' }));
const cronRuns = vi.hoisted(() => ({ jobs: [] as unknown[], fail: null as Error | null }));
// 실행 기록(#373 ⑥)은 run-log.db.test.ts가 실제 DB로 본다. 여기서는 어느 작업 이름·시각으로 감싸는지만 본다
vi.mock('@/server/cron/run-log', () => ({
  recordCronRun: async (db: unknown, job: string, now: Date, run: () => Promise<unknown>) => {
    cronRuns.jobs.push({ db, job, now });
    if (cronRuns.fail) throw cronRuns.fail;
    return run();
  },
}));
vi.mock('@/lib/request-time', () => ({ getRequestNow: async () => NOW }));
vi.mock('@/server/notifications', () => ({ sendDueReminders: state.send }));
vi.mock('@/server/refunds', () => ({ sweepAgreedCancelRequests: state.sweep }));

const { POST } = await import('./route');

function request(authorization?: string) {
  return new Request('http://localhost/api/cron/reminders', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  cronRuns.jobs = [];
  cronRuns.fail = null;
  state.send.mockReset();
  state.send.mockResolvedValue(SUMMARY);
  state.sweep.mockReset();
  state.sweep.mockResolvedValue(SWEEP);
  vi.stubEnv('CRON_SECRET', 'cron-secret-test');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/cron/reminders', () => {
  it('값이 맞으면 서버 시각으로 리마인드를 보내고 합의 후 취소 요청을 정리한 뒤 결과 개수를 돌려준다', async () => {
    const response = await POST(request('Bearer cron-secret-test'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reminders: SUMMARY, agreedCancels: SWEEP });
    expect(state.send).toHaveBeenCalledWith('db', NOW);
    expect(state.sweep).toHaveBeenCalledWith('db', NOW);
  });

  it.each([
    ['헤더 없음', undefined],
    ['값이 다름', 'Bearer cron-secret-tesX'],
    ['Bearer 없이 값만', 'cron-secret-test'],
  ])('%s → 401이고 보내지 않는다', async (_, authorization) => {
    const response = await POST(request(authorization));
    expect(response.status).toBe(401);
    expect(state.send).not.toHaveBeenCalled();
    expect(state.sweep).not.toHaveBeenCalled();
  });
});

describe('실행 기록 (#373 ⑥)', () => {
  it('작업을 "reminders" 이름과 서버 시각으로 감싸고, 401이면 감싸지 않는다', async () => {
    expect((await POST(request('Bearer cron-secret-test'))).status).toBe(200);
    expect(cronRuns.jobs).toEqual([{ db: 'db', job: 'reminders', now: NOW }]);

    cronRuns.jobs = [];
    expect((await POST(request('Bearer wrong'))).status).toBe(401);
    expect(cronRuns.jobs).toEqual([]);
  });

  it('작업이 실패하면 그 오류가 주소까지 올라온다(예약 작업 쪽에서도 실패로 보인다)', async () => {
    cronRuns.fail = new Error('boom');
    await expect(POST(request('Bearer cron-secret-test'))).rejects.toThrow('boom');
  });
});
