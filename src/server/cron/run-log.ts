// 예약 작업 실행 기록 남기기 (#373 ⑥, #433, 11/16). 서버에서만 부른다. 예약 작업 주소(src/app/api/cron/*)가 작업을 이 함수로 감싼다.
// 시작할 때 한 줄을 넣고, 끝나면 성공과 처리 개수(작업이 돌려준 결과 그대로, 개수만 있다)를, 실패하면 오류 이름과 메시지를 채운다.
// 기록을 남기다 실패해도 작업은 막지 않는다(로그만 남긴다). 작업이 실패하면 기록한 뒤 그 오류를 다시 던져서 주소는 지금처럼 오류로 끝난다.
// 끝날 때 그 작업의 오래된 기록(CRON_RUN_KEEP_DAYS)을 지운다

import 'server-only';

import { and, eq, lt } from 'drizzle-orm';

import type { getDb } from '@/db';
import { type CronJob, cronRuns } from '@/db/schema';
import { CRON_RUN_KEEP_DAYS } from '@/server/policy/cron';

type Db = Pick<ReturnType<typeof getDb>, 'insert' | 'update' | 'delete'>;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 실패 이유 글자. 오류 이름과 메시지 첫 줄만 남긴다(300자까지).
 * DB 오류는 Drizzle이 "Failed query: (SQL) params: (값)"으로 감싸서, 값이 기록에 남지 않게 감싼 원래 오류를 쓴다
 */
export function describeCronError(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown';
  const wrapped = error.message.startsWith('Failed query');
  const source = wrapped && error.cause instanceof Error ? error.cause : error;
  if (source.message.startsWith('Failed query')) return source.name;
  const firstLine = source.message.split('\n')[0];
  return (firstLine ? `${source.name}: ${firstLine}` : source.name).slice(0, 300);
}

function logRecordError(job: CronJob, step: string, error: unknown) {
  console.error(
    '[cron] 실행 기록 실패:',
    job,
    step,
    error instanceof Error ? error.name : 'unknown',
  );
}

/**
 * 작업 하나를 실행 기록과 함께 돌린다. now는 작업이 쓰는 서버 시각(getRequestNow)이고 시작 시각이 된다.
 * 끝난 시각은 시작 시각에 걸린 시간을 더해 정한다(서버 시각을 바꿔 확인하는 개발 환경에서도 시작과 끝이 맞게)
 */
export async function recordCronRun<T>(
  db: Db,
  job: CronJob,
  now: Date,
  run: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  const finishedAt = () => new Date(now.getTime() + Math.round(performance.now() - started));

  let runId: string | null = null;
  try {
    const [row] = await db
      .insert(cronRuns)
      .values({ job, startedAt: now })
      .returning({ id: cronRuns.id });
    runId = row.id;
  } catch (error) {
    logRecordError(job, 'start', error);
  }

  const finish = async (values: Partial<typeof cronRuns.$inferInsert>) => {
    if (!runId) return;
    try {
      await db
        .update(cronRuns)
        .set({ finishedAt: finishedAt(), ...values })
        .where(eq(cronRuns.id, runId));
    } catch (error) {
      logRecordError(job, 'finish', error);
    }
  };

  try {
    const result = await run();
    await finish({ ok: true, summary: result as unknown });
    return result;
  } catch (error) {
    await finish({ ok: false, error: describeCronError(error) });
    throw error;
  } finally {
    try {
      await db
        .delete(cronRuns)
        .where(
          and(
            eq(cronRuns.job, job),
            lt(cronRuns.startedAt, new Date(now.getTime() - CRON_RUN_KEEP_DAYS * DAY_MS)),
          ),
        );
    } catch (error) {
      logRecordError(job, 'prune', error);
    }
  }
}
