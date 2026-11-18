// 예약 작업 화면 조회(#373 ⑥)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 최근 실행이 맨 앞에 오도록 다른 기록보다 늦은 시각(2099년)으로 넣는다.

import { afterAll, expect, it } from 'vitest';

import { cronRuns } from '@/db/schema';

import { closeTestDb, describeDb, withRollback } from '../../../../tests/db/test-db';
import { selectCronRuns } from './queries';

const at = (minute: number) => new Date(Date.UTC(2099, 0, 1, 0, minute));

describeDb('예약 작업 조회 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('작업마다 최근 실행부터 limit개, 마지막 성공은 최근 실행 밖이어도 읽는다', async () => {
    await withRollback(async (tx) => {
      await tx.insert(cronRuns).values([
        { job: 'reminders', startedAt: at(0), finishedAt: at(0), ok: true },
        { job: 'reminders', startedAt: at(5), finishedAt: at(5), ok: false, error: 'Error: a' },
        { job: 'reminders', startedAt: at(10), finishedAt: at(10), ok: false, error: 'Error: b' },
        { job: 'reminders', startedAt: at(15) },
        {
          job: 'payments-sweep',
          startedAt: at(20),
          finishedAt: at(20),
          ok: true,
          summary: { orders: { checked: 1 } },
        },
      ]);

      const data = await selectCronRuns(tx, 3);
      expect(data.map((item) => item.job)).toEqual([
        'payments-sweep',
        'reminders',
        'settlement-batch',
        'slot-digest',
      ]);

      const reminders = data.find((item) => item.job === 'reminders')!;
      expect(reminders.runs.map((run) => run.startedAt)).toEqual([at(15), at(10), at(5)]);
      expect(reminders.runs[1]).toMatchObject({ ok: false, error: 'Error: b', finishedAt: at(10) });
      expect(reminders.runs[0]).toMatchObject({ ok: null, finishedAt: null });
      // 최근 3개는 모두 실패·도는 중이지만 마지막 성공(0분)은 따로 읽는다
      expect(reminders.lastSuccessAt).toEqual(at(0));

      const sweep = data.find((item) => item.job === 'payments-sweep')!;
      expect(sweep.runs[0]).toMatchObject({ summary: { orders: { checked: 1 } }, ok: true });
      expect(sweep.lastSuccessAt).toEqual(at(20));
    });
  });
});
