// 예약 작업 상태 판정 (#373 ⑥, 11/16). 기준 값은 정책 값(30분·15분·26시간, 3번, 10분)을 그대로 쓴다.

import { describe, expect, it } from 'vitest';

import { cronJobStatus, type CronRunRow, runOutcome } from './status';

const NOW = new Date('2026-11-16T12:00:00.000Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60 * 1000);
const done = (minutes: number, ok: boolean): CronRunRow => ({
  startedAt: minutesAgo(minutes),
  finishedAt: minutesAgo(minutes),
  ok,
});

describe('실행 하나의 결과', () => {
  it('끝났으면 성공·실패, 끝나지 않았으면 10분까지 도는 중이고 10분부터 중간에 멈춤', () => {
    expect(runOutcome(done(1, true), NOW)).toBe('ok');
    expect(runOutcome(done(1, false), NOW)).toBe('failed');
    const unfinished = (minutes: number) => ({
      startedAt: minutesAgo(minutes),
      finishedAt: null,
      ok: null,
    });
    expect(runOutcome(unfinished(9), NOW)).toBe('running');
    expect(runOutcome(unfinished(10), NOW)).toBe('stopped');
  });
});

describe('작업 상태', () => {
  it('기록이 하나도 없으면 기록 없음(등록 빠뜨림도 잡는다)', () => {
    expect(cronJobStatus('settlement-batch', [], null, NOW)).toMatchObject({
      state: 'no_record',
      lastRun: null,
      consecutiveFailures: 0,
    });
  });

  it('마지막 성공이 결제 정리 30분, 리마인드 15분, 하루 작업 26시간보다 오래되면 늦음(딱 그 시간은 정상)', () => {
    expect(cronJobStatus('payments-sweep', [done(30, true)], minutesAgo(30), NOW).state).toBe('ok');
    expect(cronJobStatus('payments-sweep', [done(31, true)], minutesAgo(31), NOW).state).toBe(
      'stale',
    );
    expect(cronJobStatus('reminders', [done(16, true)], minutesAgo(16), NOW).state).toBe('stale');
    expect(
      cronJobStatus('slot-digest', [done(26 * 60, true)], minutesAgo(26 * 60), NOW).state,
    ).toBe('ok');
    expect(
      cronJobStatus('settlement-batch', [done(26 * 60 + 1, true)], minutesAgo(26 * 60 + 1), NOW)
        .state,
    ).toBe('stale');
  });

  it('최근부터 3번 이어서 실패(중간에 멈춤 포함)하면 실패 중. 도는 중인 실행은 건너뛰고, 성공을 만나면 멈춘다', () => {
    const running = { startedAt: minutesAgo(1), finishedAt: null, ok: null };
    const stopped = { startedAt: minutesAgo(25), finishedAt: null, ok: null };
    const failing = cronJobStatus(
      'payments-sweep',
      [running, done(5, false), done(15, false), stopped, done(35, true)],
      minutesAgo(35),
      NOW,
    );
    expect(failing).toMatchObject({ state: 'failing', consecutiveFailures: 3 });
    expect(failing.lastRun).toMatchObject({ outcome: 'running' });

    const twice = cronJobStatus(
      'payments-sweep',
      [done(5, false), done(15, false), done(25, true)],
      minutesAgo(25),
      NOW,
    );
    expect(twice).toMatchObject({ state: 'ok', consecutiveFailures: 2 });
  });

  it('최근 기록이 모두 실패여도 마지막 성공은 따로 받고, 성공이 한 번도 없으면 늦음', () => {
    expect(cronJobStatus('reminders', [done(3, false)], null, NOW)).toMatchObject({
      state: 'stale',
      lastSuccessAt: null,
      consecutiveFailures: 1,
    });
  });
});
