import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/state';
import { CRON_JOBS, type CronJob } from '@/db/schema';
import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { firstParam, type SearchValue } from '@/lib/search-params';
import { formatKstDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { ensureAdminPage } from '@/server/auth';
import { CRON_FAILURE_ALERT_COUNT, CRON_RUN_KEEP_DAYS } from '@/server/policy/cron';

import {
  CRON_JOB_LABELS,
  CRON_JOB_SCHEDULES,
  CRON_OUTCOME_LABELS,
  CRON_STATE_LABELS,
  durationLabel,
  JOBS_PATH,
  staleLimitLabel,
  summaryLabel,
  toCronJob,
} from './format';
import { selectCronRuns } from './queries';
import { type CronJobState, cronJobStatus, runOutcome } from './status';

export const metadata: Metadata = { title: '예약 작업' };

type SearchParams = Promise<{ job?: SearchValue }>;

const HEAD_CELL = 'px-4 py-3 font-medium whitespace-nowrap';
const CELL = 'px-4 py-3';
/** 작업마다 보여 줄 최근 실행 수 */
const RECENT_RUNS = 20;

const STATE_VARIANTS: Record<CronJobState, 'secondary' | 'outline' | 'destructive'> = {
  ok: 'secondary',
  stale: 'destructive',
  failing: 'destructive',
  no_record: 'outline',
};

// 예약 작업 상태 (#373 ⑥, 11/16). 주소: /admin/jobs?job=payments-sweep|reminders|settlement-batch|slot-digest.
// 작업마다 마지막 실행·성공 여부·이어진 실패를 보고, 아래에서 고른 작업의 최근 실행 기록(처리 개수·실패 이유)을 본다.
// 기록은 처리 개수와 오류 이름·메시지만이라 개인정보가 없다(열람 기록을 남기지 않는다)
export default function AdminJobsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">예약 작업</h1>
        <p className="text-sm text-muted-foreground">
          정해진 시각에 저절로 도는 작업이에요. 마지막 성공이 늦거나 {CRON_FAILURE_ALERT_COUNT}번
          이어서 실패하면 운영자 화면 위에 경고가 떠요. 기록은 {CRON_RUN_KEEP_DAYS}일 동안 남아요.
        </p>
      </div>
      <Suspense fallback={<JobsSkeleton />}>
        <Jobs searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Jobs({ searchParams }: { searchParams: SearchParams }) {
  await ensureAdminPage();
  const params = await searchParams;
  const now = await getRequestNow();
  const data = await selectCronRuns(getDb(), RECENT_RUNS);
  const statuses = data.map((item) => cronJobStatus(item.job, item.runs, item.lastSuccessAt, now));
  const selected =
    toCronJob(firstParam(params.job)) ??
    statuses.find((status) => status.state !== 'ok')?.job ??
    CRON_JOBS[0];
  const runs = data.find((item) => item.job === selected)?.runs ?? [];

  return (
    <div className="flex flex-col gap-8">
      <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b">
              <th className={HEAD_CELL}>작업</th>
              <th className={HEAD_CELL}>도는 때</th>
              <th className={HEAD_CELL}>상태</th>
              <th className={HEAD_CELL}>마지막 실행</th>
              <th className={HEAD_CELL}>마지막 성공</th>
              <th className={cn(HEAD_CELL, 'text-right')}>이어진 실패</th>
            </tr>
          </thead>
          <tbody>
            {statuses.map((status) => (
              <tr key={status.job} className="border-b last:border-0">
                <td className={cn(CELL, 'font-medium whitespace-nowrap')}>
                  <Link href={`${JOBS_PATH}?job=${status.job}`} className="hover:underline">
                    {CRON_JOB_LABELS[status.job]}
                  </Link>
                </td>
                <td className={cn(CELL, 'whitespace-nowrap text-muted-foreground')}>
                  {CRON_JOB_SCHEDULES[status.job]}
                </td>
                <td className={CELL}>
                  <Badge variant={STATE_VARIANTS[status.state]}>
                    {CRON_STATE_LABELS[status.state]}
                  </Badge>
                  {status.state === 'stale' ? (
                    <span className="block pt-1 text-xs text-muted-foreground">
                      {staleLimitLabel(status.job)} 넘게 성공하지 못했어요
                    </span>
                  ) : null}
                  {status.state === 'no_record' ? (
                    <span className="block pt-1 text-xs text-muted-foreground">
                      Supabase에 예약 작업이 등록됐는지 확인해 주세요
                    </span>
                  ) : null}
                </td>
                <td className={cn(CELL, 'whitespace-nowrap')}>
                  {status.lastRun ? (
                    <>
                      {formatKstDateTime(status.lastRun.startedAt)}
                      <span className="text-muted-foreground">
                        {' '}
                        · {CRON_OUTCOME_LABELS[status.lastRun.outcome]}
                      </span>
                    </>
                  ) : (
                    '-'
                  )}
                </td>
                <td className={cn(CELL, 'whitespace-nowrap')}>
                  {status.lastSuccessAt ? formatKstDateTime(status.lastSuccessAt) : '-'}
                </td>
                <td className={cn(CELL, 'text-right whitespace-nowrap')}>
                  {status.consecutiveFailures}번
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">최근 실행 기록</h2>
          <nav aria-label="작업" className="flex flex-wrap gap-2">
            {CRON_JOBS.map((job) => (
              <Link
                key={job}
                href={`${JOBS_PATH}?job=${job}`}
                aria-current={job === selected ? 'page' : undefined}
                className={chipClass(job === selected)}
              >
                {CRON_JOB_LABELS[job]}
              </Link>
            ))}
          </nav>
        </div>
        {runs.length === 0 ? (
          <EmptyState
            title={`${CRON_JOB_LABELS[selected]} 기록이 없어요`}
            description="작업이 한 번 돌면 여기에 남아요."
            className="rounded-xl bg-card py-8"
          />
        ) : (
          <RunsTable job={selected} runs={runs} now={now} />
        )}
      </section>
    </div>
  );
}

function RunsTable({
  job,
  runs,
  now,
}: {
  job: CronJob;
  runs: Awaited<ReturnType<typeof selectCronRuns>>[number]['runs'];
  now: Date;
}) {
  return (
    <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
      <table
        className="w-full min-w-[56rem] text-sm"
        aria-label={`${CRON_JOB_LABELS[job]} 실행 기록`}
      >
        <thead className="text-left text-muted-foreground">
          <tr className="border-b">
            <th className={HEAD_CELL}>시작</th>
            <th className={HEAD_CELL}>결과</th>
            <th className={HEAD_CELL}>걸린 시간</th>
            <th className={HEAD_CELL}>처리 개수</th>
            <th className={HEAD_CELL}>실패 이유</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => {
            const outcome = runOutcome(run, now);
            return (
              <tr key={run.id} className="border-b last:border-0">
                <td className={cn(CELL, 'whitespace-nowrap')}>
                  {formatKstDateTime(run.startedAt)}
                </td>
                <td
                  className={cn(
                    CELL,
                    'whitespace-nowrap',
                    outcome === 'failed' || outcome === 'stopped' ? 'text-destructive' : null,
                  )}
                >
                  {CRON_OUTCOME_LABELS[outcome]}
                </td>
                <td className={cn(CELL, 'whitespace-nowrap')}>
                  {durationLabel(run.startedAt, run.finishedAt)}
                </td>
                <td className={cn(CELL, 'font-mono text-xs break-all')}>
                  {summaryLabel(run.summary)}
                </td>
                <td className={cn(CELL, 'break-all')}>{run.error ?? '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function chipClass(active: boolean) {
  return cn(
    'rounded-full px-3 py-1 text-sm ring-1 ring-foreground/10',
    active ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
  );
}

function JobsSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-56 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}
