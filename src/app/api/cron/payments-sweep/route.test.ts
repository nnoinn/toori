// 오래된 주문 정리 주소 (W12 ②, #308 ③). CRON_SECRET이 맞을 때만 정리 작업을 부르는지 본다. 정리 자체는 sweep-orders.test.ts,
// 시간대 칸 닫기는 slot-windows/hold-store.db.test.ts가 본다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = new Date('2026-11-01T03:00:00.000Z');
const SUMMARY = { checked: 1, confirmed: 1, autoCancelled: 0, failed: 0, abandoned: 0, left: 0 };
const CANCEL_SUMMARY = { checked: 2, finished: 1, cleared: 1, left: 0 };
const state = vi.hoisted(() => ({
  sweep: vi.fn(),
  sweepCancels: vi.fn(),
  closeWindowHolds: vi.fn(),
  keptAlerts: [] as unknown[],
  order: [] as string[],
}));

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
vi.mock('@/server/payments', () => ({ sweepStaleOrders: state.sweep }));
vi.mock('@/server/refunds', () => ({ sweepStaleCancels: state.sweepCancels }));
vi.mock('@/server/slot-windows', () => ({ closeStaleWindowHolds: state.closeWindowHolds }));
vi.mock('@/server/notifications/alerts', () => ({
  notifyKeptWindowSlotsReleased: (_db: unknown, slotIds: string[]) => {
    state.keptAlerts.push(slotIds);
  },
}));

const { POST } = await import('./route');

function request(authorization?: string) {
  return new Request('http://localhost/api/cron/payments-sweep', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  cronRuns.jobs = [];
  cronRuns.fail = null;
  state.sweep.mockReset();
  state.sweep.mockResolvedValue(SUMMARY);
  state.sweepCancels.mockReset();
  state.sweepCancels.mockResolvedValue(CANCEL_SUMMARY);
  state.order = [];
  state.keptAlerts = [];
  state.sweep.mockImplementation(async () => {
    state.order.push('orders');
    return SUMMARY;
  });
  state.closeWindowHolds.mockReset();
  state.closeWindowHolds.mockImplementation(async () => {
    state.order.push('windowHolds');
    return [{ slotId: 'slot-1', windowId: 'window-1' }];
  });
  vi.stubEnv('CRON_SECRET', 'cron-secret-test');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/cron/payments-sweep', () => {
  it('값이 맞으면 서버 시각으로 주문과 고객 취소를 정리하고, 주문 정리 다음에 결제 없이 끝난 시간대 칸을 닫는다', async () => {
    const response = await POST(request('Bearer cron-secret-test'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      orders: SUMMARY,
      cancels: CANCEL_SUMMARY,
      windowHolds: 1,
    });
    expect(state.sweep).toHaveBeenCalledWith('db', NOW);
    expect(state.sweepCancels).toHaveBeenCalledWith('db', NOW);
    expect(state.closeWindowHolds).toHaveBeenCalledWith('db', { now: NOW });
    expect(state.order).toEqual(['orders', 'windowHolds']);
    // 닫은 칸 중 마감 때 남긴 칸이 있으면 원장님에게 알린다(고르는 것은 알림 쪽)
    expect(state.keptAlerts).toEqual([['slot-1']]);
  });

  it.each([
    ['헤더 없음', undefined],
    ['값이 다름', 'Bearer cron-secret-tesX'],
    ['길이가 다름', 'Bearer short'],
    ['Bearer 없이 값만', 'cron-secret-test'],
  ])('%s → 401이고 정리하지 않는다', async (_, authorization) => {
    const response = await POST(request(authorization));
    expect(response.status).toBe(401);
    expect(state.sweep).not.toHaveBeenCalled();
    expect(state.sweepCancels).not.toHaveBeenCalled();
    expect(state.closeWindowHolds).not.toHaveBeenCalled();
  });

  it('서버에 CRON_SECRET이 없으면 모두 거절한다', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await POST(request('Bearer '))).status).toBe(401);
    expect(state.sweep).not.toHaveBeenCalled();
  });
});

describe('실행 기록 (#373 ⑥)', () => {
  it('작업을 "payments-sweep" 이름과 서버 시각으로 감싸고, 401이면 감싸지 않는다', async () => {
    expect((await POST(request('Bearer cron-secret-test'))).status).toBe(200);
    expect(cronRuns.jobs).toEqual([{ db: 'db', job: 'payments-sweep', now: NOW }]);

    cronRuns.jobs = [];
    expect((await POST(request('Bearer wrong'))).status).toBe(401);
    expect(cronRuns.jobs).toEqual([]);
  });

  it('작업이 실패하면 그 오류가 주소까지 올라온다(예약 작업 쪽에서도 실패로 보인다)', async () => {
    cronRuns.fail = new Error('boom');
    await expect(POST(request('Bearer cron-secret-test'))).rejects.toThrow('boom');
  });
});
