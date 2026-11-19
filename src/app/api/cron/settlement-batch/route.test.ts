// 목요일 정산 묶기 주소 (W20 ③). CRON_SECRET이 맞을 때만 묶기 작업을 서버 시각·지금 결제 수수료율로 부르는지 본다.
// 묶기 자체는 settlements/batch.db.test.ts, 지급일·금액 계산은 batch-rules.test.ts가 본다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = new Date('2026-11-04T15:30:00.000Z'); // 한국 시간 11/5(목) 0시 30분
const state = vi.hoisted(() => ({ batch: vi.fn() }));

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
vi.mock('@/server/settlements/batch', () => ({ runSettlementBatch: state.batch }));

const { POST } = await import('./route');
const { PAYMENT_FEE_RATE } = await import('@/server/policy');

function request(authorization?: string) {
  return new Request('http://localhost/api/cron/settlement-batch', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  cronRuns.jobs = [];
  cronRuns.fail = null;
  state.batch.mockReset();
  state.batch.mockResolvedValue({ status: 'payment_fee_rate_missing', payoutDate: '2026-11-05' });
  vi.stubEnv('CRON_SECRET', 'cron-secret-test');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/cron/settlement-batch', () => {
  it('값이 맞으면 서버 시각과 지금 결제 수수료율 정책값으로 묶기를 부르고 결과를 그대로 돌려준다', async () => {
    const response = await POST(request('Bearer cron-secret-test'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'payment_fee_rate_missing',
      payoutDate: '2026-11-05',
    });
    expect(state.batch).toHaveBeenCalledWith('db', { now: NOW, paymentFeeRate: PAYMENT_FEE_RATE });
  });

  it.each([
    ['헤더 없음', undefined],
    ['값이 다름', 'Bearer cron-secret-tesX'],
  ])('%s → 401이고 묶지 않는다', async (_, authorization) => {
    const response = await POST(request(authorization));
    expect(response.status).toBe(401);
    expect(state.batch).not.toHaveBeenCalled();
  });
});

describe('실행 기록 (#373 ⑥)', () => {
  it('작업을 "settlement-batch" 이름과 서버 시각으로 감싸고, 401이면 감싸지 않는다', async () => {
    expect((await POST(request('Bearer cron-secret-test'))).status).toBe(200);
    expect(cronRuns.jobs).toEqual([{ db: 'db', job: 'settlement-batch', now: NOW }]);

    cronRuns.jobs = [];
    expect((await POST(request('Bearer wrong'))).status).toBe(401);
    expect(cronRuns.jobs).toEqual([]);
  });

  it('작업이 실패하면 그 오류가 주소까지 올라온다(예약 작업 쪽에서도 실패로 보인다)', async () => {
    cronRuns.fail = new Error('boom');
    await expect(POST(request('Bearer cron-secret-test'))).rejects.toThrow('boom');
  });
});
