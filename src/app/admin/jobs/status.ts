// 예약 작업 상태 판정 (#373 ⑥, 11/16). 예약 작업 화면과 운영자 화면 위 경고가 같이 쓴다. 화면 코드에서만 쓴다.

import type { CronJob } from '@/db/schema';
import {
  CRON_FAILURE_ALERT_COUNT,
  CRON_RUN_TIMEOUT_MINUTES,
  CRON_STALE_MINUTES,
} from '@/server/policy/cron';

const MINUTE_MS = 60 * 1000;

export type CronRunRow = {
  startedAt: Date;
  finishedAt: Date | null;
  ok: boolean | null;
};

/** 실행 하나의 결과. stopped: 끝나지 않은 채 시간이 지나 중간에 멈춘 것(실패로 센다) */
export type CronRunOutcome = 'ok' | 'failed' | 'running' | 'stopped';

export function runOutcome(run: CronRunRow, now: Date): CronRunOutcome {
  if (run.finishedAt) return run.ok ? 'ok' : 'failed';
  const elapsed = now.getTime() - run.startedAt.getTime();
  return elapsed >= CRON_RUN_TIMEOUT_MINUTES * MINUTE_MS ? 'stopped' : 'running';
}

/** 작업 상태. ok: 정상, failing: 이어서 실패, stale: 마지막 성공이 늦음, no_record: 기록이 없음(등록 빠뜨림 등) */
export type CronJobState = 'ok' | 'failing' | 'stale' | 'no_record';

export type CronJobStatus = {
  job: CronJob;
  state: CronJobState;
  lastRun: (CronRunRow & { outcome: CronRunOutcome }) | null;
  lastSuccessAt: Date | null;
  /** 최근부터 이어진 실패 수(도는 중인 실행은 건너뛴다) */
  consecutiveFailures: number;
};

/**
 * 작업 하나의 상태. recentRuns는 최근 실행부터(시작 시각 내림차순), lastSuccessAt은 마지막 성공의 시작 시각(최근 실행 밖이어도).
 * 기록이 하나도 없으면 no_record, 이어서 CRON_FAILURE_ALERT_COUNT번 실패하면 failing,
 * 마지막 성공이 CRON_STALE_MINUTES보다 오래되면(같으면 아직 정상) stale
 */
export function cronJobStatus(
  job: CronJob,
  recentRuns: readonly CronRunRow[],
  lastSuccessAt: Date | null,
  now: Date,
): CronJobStatus {
  const runs = recentRuns.map((run) => ({ ...run, outcome: runOutcome(run, now) }));
  let consecutiveFailures = 0;
  for (const run of runs) {
    if (run.outcome === 'running') continue;
    if (run.outcome === 'ok') break;
    consecutiveFailures += 1;
  }
  const lastRun = runs[0] ?? null;
  const stale =
    lastSuccessAt === null ||
    now.getTime() - lastSuccessAt.getTime() > CRON_STALE_MINUTES[job] * MINUTE_MS;
  const state: CronJobState =
    lastRun === null && lastSuccessAt === null
      ? 'no_record'
      : consecutiveFailures >= CRON_FAILURE_ALERT_COUNT
        ? 'failing'
        : stale
          ? 'stale'
          : 'ok';
  return { job, state, lastRun, lastSuccessAt, consecutiveFailures };
}
