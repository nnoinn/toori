// 매물 등록 ② 시간 고르기 계산 (O4, S-204, S-209, #23 D10). 화면('use client')과 서버가 같이 쓴다.
// "지금"은 서버 시각을 받는다. 시각은 UTC Date로 다루고, 단위(분)는 한국 시간 기준으로 맞춘다.

import type { BusinessHours } from '@/db/schema/shops';
import { addMinutes, kstToUtc, utcToKst } from '@/lib/time';
import { PUBLISH_WINDOW_HOURS, SLOT_START_STEP_MINUTES } from '@/server/policy';

const MINUTE_MS = 60 * 1000;

/** 시간 구간 [start, end). 끝 시각과 다음 시작 시각이 같으면 겹치지 않는다 */
export type TimeRange = { start: Date; end: Date };

/** 끝 시각 = 시작 + 메뉴 소요 시간(D10) */
export function slotEnd(start: Date, durationMinutes: number): Date {
  return addMinutes(start, durationMinutes);
}

/** 두 구간이 겹치면 true. DB 제약(tstzrange &&, S-209)과 같은 규칙이다 */
export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

/** 고를 수 있는 마지막 시작 시각: 지금 + 48시간(S-204). 그 시각까지 포함한다 */
export function latestStart(now: Date): Date {
  return new Date(now.getTime() + PUBLISH_WINDOW_HOURS * 60 * MINUTE_MS);
}

/** 한국 시간 기준으로 단위(분)에 맞는 시각이면 true. 초·밀리초도 0이어야 한다 */
export function isOnStep(start: Date): boolean {
  if (start.getTime() % MINUTE_MS !== 0) return false;
  const kst = utcToKst(start);
  return (kst.hour * 60 + kst.minute) % SLOT_START_STEP_MINUTES === 0;
}

export type StartProblem = 'NOT_ON_STEP' | 'PAST' | 'TOO_FAR';

export const START_PROBLEM_MESSAGES: Record<StartProblem, string> = {
  NOT_ON_STEP: `시작 시각은 ${SLOT_START_STEP_MINUTES}분 단위로 골라 주세요`,
  PAST: '이미 지난 시각이에요',
  TOO_FAR: `지금부터 ${PUBLISH_WINDOW_HOURS}시간 안의 시각만 올릴 수 있어요`,
};

/** 시작 시각의 문제. 없으면 null. 지금과 같은 시각은 지난 것으로 본다 */
export function checkStart(start: Date, now: Date): StartProblem | null {
  if (!isOnStep(start)) return 'NOT_ON_STEP';
  if (start.getTime() <= now.getTime()) return 'PAST';
  if (start.getTime() > latestStart(now).getTime()) return 'TOO_FAR';
  return null;
}

/** 지금 이후 첫 단위 시각부터 48시간까지, 고를 수 있는 시작 시각 전부 */
export function startCandidates(now: Date): Date[] {
  const kst = utcToKst(now);
  // 지금이 들어 있는 분의 시작(한국 시간)에서 다음 단위로 올린다
  const minuteStart = kstToUtc(kst);
  const minutesOfDay = kst.hour * 60 + kst.minute;
  const toNext = SLOT_START_STEP_MINUTES - (minutesOfDay % SLOT_START_STEP_MINUTES);
  let cursor = addMinutes(minuteStart, toNext);
  const last = latestStart(now).getTime();
  const result: Date[] = [];
  while (cursor.getTime() <= last) {
    result.push(cursor);
    cursor = addMinutes(cursor, SLOT_START_STEP_MINUTES);
  }
  return result;
}

export type HoursProblem = 'CLOSED_DAY' | 'OUTSIDE_HOURS';

export const HOURS_PROBLEM_MESSAGES: Record<HoursProblem, string> = {
  CLOSED_DAY: '쉬는 날에는 매물을 올릴 수 없어요',
  OUTSIDE_HOURS: '영업시간 안에 끝나는 시각을 골라 주세요',
};

const minutesOfDay = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/**
 * 매물 시간이 샵 영업시간(O2) 안이면 null(정민석 결정 10/28). 시작 요일(한국 시간)의 영업시간으로 본다.
 * 그 요일 영업시간을 입력하지 않았으면 막지 않는다. 끝 시각이 닫는 시각과 같으면 괜찮다
 */
export function checkBusinessHours(range: TimeRange, hours: BusinessHours): HoursProblem | null {
  const start = utcToKst(range.start);
  const entry = hours.find((item) => item.weekday === start.weekday);
  if (!entry) return null;
  if ('closed' in entry) return 'CLOSED_DAY';
  const end = utcToKst(range.end);
  const sameDay = kstDateKey(range.start) === kstDateKey(range.end);
  const startMinutes = start.hour * 60 + start.minute;
  // 자정에 딱 끝나면 다음 날 0시라서 24:00으로 본다
  const endMinutes = sameDay
    ? end.hour * 60 + end.minute
    : end.hour === 0 && end.minute === 0
      ? 1440
      : Infinity;
  if (startMinutes < minutesOfDay(entry.open) || endMinutes > minutesOfDay(entry.close)) {
    return 'OUTSIDE_HOURS';
  }
  return null;
}

/** 한국 날짜 key. 예: "2026-11-01" */
export function kstDateKey(date: Date): string {
  const t = utcToKst(date);
  return `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
}

/** 시작 시각 후보를 한국 날짜별로 묶는다(날짜 순서 유지) */
export function groupByKstDate(starts: Date[]): { dateKey: string; starts: Date[] }[] {
  const groups = new Map<string, Date[]>();
  for (const start of starts) {
    const key = kstDateKey(start);
    groups.set(key, [...(groups.get(key) ?? []), start]);
  }
  return [...groups].map(([dateKey, items]) => ({ dateKey, starts: items }));
}
