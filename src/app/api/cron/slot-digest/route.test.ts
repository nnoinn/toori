// 관심 동네·찜한 샵 새 매물 알림 주소 (W17 ②). CRON_SECRET이 맞을 때만 보내는지, 보낸 뒤 쓰이지 않는 등록증을 지우는지(#478) 본다.
// 보내기 자체는 digest.test.ts, 등록증 고르기는 business-doc-cleanup.test.ts가 본다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = new Date('2026-11-12T04:00:00.000Z');
const SUMMARY = { customers: 3, sent: 2, failed: 0, skipped: null };
const CLEANUP = { checked: 6, deleted: 2, failed: 0 };
const state = vi.hoisted(() => ({ send: vi.fn(), cleanUp: vi.fn(), order: [] as string[] }));

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
vi.mock('@/server/notifications', () => ({ sendSlotDigest: state.send }));
vi.mock('@/server/storage/business-doc-cleanup', () => ({ cleanUpBusinessDocs: state.cleanUp }));

const { POST } = await import('./route');

function request(authorization?: string) {
  return new Request('http://localhost/api/cron/slot-digest', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  cronRuns.jobs = [];
  cronRuns.fail = null;
  state.order = [];
  state.send.mockReset();
  state.send.mockImplementation(async () => {
    state.order.push('send');
    return SUMMARY;
  });
  state.cleanUp.mockReset();
  state.cleanUp.mockImplementation(async () => {
    state.order.push('cleanUp');
    return CLEANUP;
  });
  vi.stubEnv('CRON_SECRET', 'cron-secret-test');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/cron/slot-digest', () => {
  it('값이 맞으면 서버 시각으로 새 매물 알림을 보내고 결과 개수를 돌려준다', async () => {
    const response = await POST(request('Bearer cron-secret-test'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ digest: SUMMARY, businessDocs: CLEANUP });
    expect(state.send).toHaveBeenCalledWith('db', NOW);
  });

  it('알림을 보낸 뒤 같은 서버 시각으로 쓰이지 않는 등록증을 지우고(#478) 결과에 지운 수를 남긴다', async () => {
    await POST(request('Bearer cron-secret-test'));
    expect(state.order).toEqual(['send', 'cleanUp']);
    expect(state.cleanUp).toHaveBeenCalledWith('db', NOW);
  });

  it.each([
    ['헤더 없음', undefined],
    ['값이 다름', 'Bearer cron-secret-tesX'],
    ['Bearer 없이 값만', 'cron-secret-test'],
  ])('%s → 401이고 보내지 않는다', async (_, authorization) => {
    const response = await POST(request(authorization));
    expect(response.status).toBe(401);
    expect(state.send).not.toHaveBeenCalled();
    expect(state.cleanUp).not.toHaveBeenCalled();
  });
});

describe('실행 기록 (#373 ⑥)', () => {
  it('작업을 "slot-digest" 이름과 서버 시각으로 감싸고, 401이면 감싸지 않는다', async () => {
    expect((await POST(request('Bearer cron-secret-test'))).status).toBe(200);
    expect(cronRuns.jobs).toEqual([{ db: 'db', job: 'slot-digest', now: NOW }]);

    cronRuns.jobs = [];
    expect((await POST(request('Bearer wrong'))).status).toBe(401);
    expect(cronRuns.jobs).toEqual([]);
  });

  it('작업이 실패하면 그 오류가 주소까지 올라온다(예약 작업 쪽에서도 실패로 보인다)', async () => {
    cronRuns.fail = new Error('boom');
    await expect(POST(request('Bearer cron-secret-test'))).rejects.toThrow('boom');
  });
});
