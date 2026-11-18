// 예약 작업 실행 기록 (#373 ⑥, #433)을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { cronRuns } from '@/db/schema';

import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import { recordCronRun } from './run-log';

// 다른 테스트의 기록과 섞이지 않게 아주 오래전 시각을 쓴다
const NOW = new Date('2020-02-01T00:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const daysBefore = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

async function rowsOf(tx: TestTx, job: string) {
  return tx
    .select({
      startedAt: cronRuns.startedAt,
      finishedAt: cronRuns.finishedAt,
      ok: cronRuns.ok,
      summary: cronRuns.summary,
      error: cronRuns.error,
    })
    .from(cronRuns)
    .where(eq(cronRuns.job, job))
    .orderBy(cronRuns.startedAt);
}

describeDb('예약 작업 실행 기록 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('성공하면 결과를 그대로 돌려주고, 시작·끝 시각과 성공·처리 개수를 남긴다', async () => {
    await withRollback(async (tx) => {
      const result = await recordCronRun(tx, 'reminders', NOW, async () => ({
        reminders: { sent: 2 },
      }));
      expect(result).toEqual({ reminders: { sent: 2 } });

      const [row] = (await rowsOf(tx, 'reminders')).filter(
        (r) => r.startedAt.getTime() === NOW.getTime(),
      );
      expect(row).toMatchObject({ ok: true, summary: { reminders: { sent: 2 } }, error: null });
      expect(row.finishedAt!.getTime()).toBeGreaterThanOrEqual(NOW.getTime());
    });
  });

  it('실패하면 실패와 오류 이름·메시지를 남기고 그 오류를 다시 던진다', async () => {
    await withRollback(async (tx) => {
      await expect(
        recordCronRun(tx, 'slot-digest', NOW, async () => {
          throw new TypeError('fetch failed');
        }),
      ).rejects.toThrow('fetch failed');

      const [row] = (await rowsOf(tx, 'slot-digest')).filter(
        (r) => r.startedAt.getTime() === NOW.getTime(),
      );
      expect(row).toMatchObject({ ok: false, summary: null, error: 'TypeError: fetch failed' });
      expect(row.finishedAt).not.toBeNull();
    });
  });

  it('끝날 때 그 작업의 30일 지난 기록만 지운다(다른 작업, 30일 안 기록은 남긴다)', async () => {
    await withRollback(async (tx) => {
      await tx.insert(cronRuns).values([
        { job: 'payments-sweep', startedAt: daysBefore(31), finishedAt: daysBefore(31), ok: true },
        { job: 'payments-sweep', startedAt: daysBefore(29), finishedAt: daysBefore(29), ok: true },
        {
          job: 'settlement-batch',
          startedAt: daysBefore(40),
          finishedAt: daysBefore(40),
          ok: true,
        },
      ]);

      await recordCronRun(tx, 'payments-sweep', NOW, async () => ({ orders: { checked: 0 } }));

      expect((await rowsOf(tx, 'payments-sweep')).map((r) => r.startedAt)).toEqual([
        daysBefore(29),
        NOW,
      ]);
      expect((await rowsOf(tx, 'settlement-batch')).map((r) => r.startedAt)).toEqual([
        daysBefore(40),
      ]);
    });
  });
});
