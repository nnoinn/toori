// 예약 작업 화면 표시 모양 (#373 ⑥).

import { describe, expect, it } from 'vitest';

import { CRON_JOBS } from '@/db/schema';

import {
  CRON_JOB_LABELS,
  CRON_JOB_SCHEDULES,
  durationLabel,
  staleLimitLabel,
  summaryLabel,
  toCronJob,
} from './format';

const at = (seconds: number) => new Date(Date.UTC(2026, 10, 16, 3, 0, seconds));

describe('예약 작업 표시', () => {
  it('작업 4개 모두 이름과 주기가 있다', () => {
    for (const job of CRON_JOBS) {
      expect(CRON_JOB_LABELS[job], job).toBeTruthy();
      expect(CRON_JOB_SCHEDULES[job], job).toBeTruthy();
    }
  });

  it('늦음 기준은 분이나 시간으로', () => {
    expect(staleLimitLabel('payments-sweep')).toBe('30분');
    expect(staleLimitLabel('reminders')).toBe('15분');
    expect(staleLimitLabel('settlement-batch')).toBe('26시간');
  });

  it('주소 값은 아는 작업만', () => {
    expect(toCronJob('reminders')).toBe('reminders');
    expect(toCronJob('unknown')).toBeNull();
    expect(toCronJob(undefined)).toBeNull();
  });

  it('걸린 시간과 처리 개수', () => {
    expect(durationLabel(at(0), null)).toBe('-');
    expect(durationLabel(at(0), new Date(at(0).getTime() + 400))).toBe('1초 미만');
    expect(durationLabel(at(0), at(42))).toBe('42초');
    expect(durationLabel(at(0), at(125))).toBe('2분 5초');
    expect(summaryLabel(null)).toBe('-');
    expect(summaryLabel({ reminders: { sent: 2 } })).toBe('{"reminders":{"sent":2}}');
  });
});
