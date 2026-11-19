import Link from 'next/link';

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { getCurrentAccount } from '@/server/auth';
import { CRON_FAILURE_ALERT_COUNT } from '@/server/policy/cron';

import { CRON_JOB_LABELS, CRON_STATE_LABELS, JOBS_PATH } from './jobs/format';
import { selectCronRuns } from './jobs/queries';
import { cronJobStatus } from './jobs/status';

/**
 * 운영자 화면 위 예약 작업 경고 한 줄 (#373 ⑥, 11/16). 마지막 성공이 늦거나 이어서 실패하거나 기록이 없는 작업이 있을 때만 그린다.
 * 운영자로 들어왔을 때만 보이고 <Suspense> 안에서 부른다. 경고 때문에 운영자 화면이 깨지면 안 되어서, 조회가 실패하면 그리지 않는다
 */
export async function CronWarning() {
  const account = await getCurrentAccount();
  if (account?.mode !== 'admin' || !account.isAdmin) return null;
  let problems: { label: string; state: string }[];
  try {
    const now = await getRequestNow();
    // 도는 중인 실행 하나를 건너뛰고도 이어진 실패를 셀 만큼만 읽는다
    const data = await selectCronRuns(getDb(), CRON_FAILURE_ALERT_COUNT + 1);
    problems = data
      .map((item) => cronJobStatus(item.job, item.runs, item.lastSuccessAt, now))
      .filter((status) => status.state !== 'ok')
      .map((status) => ({
        label: CRON_JOB_LABELS[status.job],
        state: CRON_STATE_LABELS[status.state],
      }));
  } catch (error) {
    console.error(
      '[admin] 예약 작업 경고 조회 실패:',
      error instanceof Error ? error.name : 'unknown',
    );
    return null;
  }
  if (problems.length === 0) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 border-b bg-destructive/10 px-6 py-2 text-sm"
    >
      <p>
        <span className="font-medium">예약 작업 확인이 필요해요</span>{' '}
        {problems.map((problem) => `${problem.label}(${problem.state})`).join(', ')}
      </p>
      <Link href={JOBS_PATH} className="font-medium text-destructive hover:underline">
        예약 작업 보기
      </Link>
    </div>
  );
}
