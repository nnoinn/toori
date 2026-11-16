// 예약 작업 화면(#373 ⑥)과 운영자 화면 위 경고의 조회. 작업마다 최근 실행과 마지막 성공을 읽는다.
// 실행 기록은 처리 개수와 오류 이름·메시지만 있어서 개인정보가 없다(열람 기록을 남기지 않는다).

import 'server-only';

import { and, desc, eq } from 'drizzle-orm';

import type { getDb } from '@/db';
import { CRON_JOBS, type CronJob, cronRuns } from '@/db/schema';

import type { CronRunRow } from './status';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

export type CronRunView = CronRunRow & {
  id: string;
  /** 처리 개수(작업이 돌려준 결과) */
  summary: unknown;
  error: string | null;
};

export type CronJobRuns = {
  job: CronJob;
  /** 최근 실행부터 */
  runs: CronRunView[];
  /** 마지막 성공의 시작 시각(최근 실행 밖이어도). 없으면 null */
  lastSuccessAt: Date | null;
};

/** 작업마다 최근 실행 limit개와 마지막 성공. 작업 순서는 CRON_JOBS 그대로 */
export async function selectCronRuns(db: DbReader, limit: number): Promise<CronJobRuns[]> {
  return Promise.all(
    CRON_JOBS.map(async (job) => {
      const [runs, [success]] = await Promise.all([
        db
          .select({
            id: cronRuns.id,
            startedAt: cronRuns.startedAt,
            finishedAt: cronRuns.finishedAt,
            ok: cronRuns.ok,
            summary: cronRuns.summary,
            error: cronRuns.error,
          })
          .from(cronRuns)
          .where(eq(cronRuns.job, job))
          .orderBy(desc(cronRuns.startedAt), desc(cronRuns.id))
          .limit(limit),
        db
          .select({ startedAt: cronRuns.startedAt })
          .from(cronRuns)
          .where(and(eq(cronRuns.job, job), eq(cronRuns.ok, true)))
          .orderBy(desc(cronRuns.startedAt))
          .limit(1),
      ]);
      return { job, runs, lastSuccessAt: success?.startedAt ?? null };
    }),
  );
}
