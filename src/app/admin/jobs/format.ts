// 예약 작업 화면(#373 ⑥)의 이름표와 표시 모양. 화면 코드에서만 쓴다.

import { CRON_JOBS, type CronJob } from '@/db/schema';
import { CRON_STALE_MINUTES } from '@/server/policy/cron';

import type { CronJobState, CronRunOutcome } from './status';

export const JOBS_PATH = '/admin/jobs';

export const CRON_JOB_LABELS: Record<CronJob, string> = {
  'payments-sweep': '결제 정리',
  reminders: '리마인드',
  'settlement-batch': '정산 묶기',
  'slot-digest': '새 매물 알림',
};

/** 언제 도는지(src/db/cron/*.sql, 한국 시간) */
export const CRON_JOB_SCHEDULES: Record<CronJob, string> = {
  'payments-sweep': '10분마다',
  reminders: '5분마다',
  'settlement-batch': '매일 0시 30분',
  'slot-digest': '매일 오후 1시',
};

export const CRON_STATE_LABELS: Record<CronJobState, string> = {
  ok: '정상',
  failing: '실패 중',
  stale: '늦음',
  no_record: '기록 없음',
};

export const CRON_OUTCOME_LABELS: Record<CronRunOutcome, string> = {
  ok: '성공',
  failed: '실패',
  running: '도는 중',
  stopped: '중간에 멈춤',
};

/** 늦음 기준 안내. 예: "30분", "26시간" */
export function staleLimitLabel(job: CronJob): string {
  const minutes = CRON_STALE_MINUTES[job];
  return minutes % 60 === 0 ? `${minutes / 60}시간` : `${minutes}분`;
}

/** 주소 값의 작업. 모르는 값이면 null */
export function toCronJob(value: string | undefined): CronJob | null {
  return CRON_JOBS.find((job) => job === value) ?? null;
}

/** 걸린 시간. 1초 미만은 "1초 미만" */
export function durationLabel(startedAt: Date, finishedAt: Date | null): string {
  if (!finishedAt) return '-';
  const seconds = Math.floor((finishedAt.getTime() - startedAt.getTime()) / 1000);
  if (seconds < 1) return '1초 미만';
  if (seconds < 60) return `${seconds}초`;
  return `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
}

/** 처리 개수를 한 줄로. 작업이 돌려준 결과를 그대로 보여 준다(값은 개수뿐이다) */
export function summaryLabel(summary: unknown): string {
  if (summary === null || summary === undefined) return '-';
  return JSON.stringify(summary);
}
