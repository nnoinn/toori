// 매물 등록 ② 시간 고르기 계산 (O4, S-204, S-205, S-209, #23 D10). 화면('use client')과 서버가 같이 쓴다.
// "지금"은 서버 시각을 받는다. 시각은 UTC Date로 다루고, 단위(분)는 한국 시간 기준으로 맞춘다.
// 미리 올리기(S-205): 시작이 14일 안이면 올릴 수 있고, 시작 48시간 전까지는 예약대기로 두었다가 그때 게시중이 된다.

import type { BusinessHours } from '@/db/schema/shops';
import { addHours, addMinutes, kstToUtc, utcToKst } from '@/lib/time';
import {
  ADVANCE_LISTING_DAYS,
  PUBLISH_WINDOW_HOURS,
  SLOT_START_STEP_MINUTES,
} from '@/server/policy';
import { kstDateKey } from '@/lib/time';

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

/**
 * 고를 수 있는 시작 시각의 범위.
 * - advance: 새로 올리거나 예약대기 매물을 고칠 때. 지금부터 14일 안(S-205)
 * - published: 이미 게시중인 매물을 고칠 때. 지금부터 48시간 안(S-204). 고객에게 보이던 매물이
 *   다시 예약대기로 숨었다가 관심 동네 알림에 새 매물로 또 나가지 않게 막는다(11/9 정민석)
 */
export type StartWindow = 'advance' | 'published';

/** 고를 수 있는 마지막 시작 시각. 그 시각까지 포함한다 */
export function latestStart(now: Date, window: StartWindow = 'advance'): Date {
  return window === 'published'
    ? addHours(now, PUBLISH_WINDOW_HOURS)
    : addHours(now, ADVANCE_LISTING_DAYS * 24);
}

/** 저장할 게시 상태와 게시 시각 */
export type PublishPlan = { status: 'scheduled' | 'published'; publishAt: Date };

/**
 * 새 매물(등록·재등록)과 예약대기 매물을 고칠 때의 게시 시각(S-204·S-205).
 * 시작 48시간 전이 아직 오지 않았으면 그 시각에 게시하는 예약대기, 이미 지났으면 지금 게시하는 게시중이다.
 * 딱 48시간 전이면 지금 게시한다(매물 상태 계산은 지금이 게시 시각보다 앞일 때만 예약대기로 본다)
 */
export function publishPlan(start: Date, now: Date): PublishPlan {
  const publishAt = addHours(start, -PUBLISH_WINDOW_HOURS);
  return publishAt.getTime() > now.getTime()
    ? { status: 'scheduled', publishAt }
    : { status: 'published', publishAt: now };
}

/** 한국 시간 기준으로 단위(분)에 맞는 시각이면 true. 초·밀리초도 0이어야 한다 */
export function isOnStep(start: Date): boolean {
  if (start.getTime() % MINUTE_MS !== 0) return false;
  const kst = utcToKst(start);
  return (kst.hour * 60 + kst.minute) % SLOT_START_STEP_MINUTES === 0;
}

export type StartProblem = 'NOT_ON_STEP' | 'PAST' | 'TOO_FAR' | 'TOO_FAR_PUBLISHED';

export const START_PROBLEM_MESSAGES: Record<StartProblem, string> = {
  NOT_ON_STEP: `시작 시각은 ${SLOT_START_STEP_MINUTES}분 단위로 골라 주세요`,
  PAST: '이미 지난 시각이에요',
  TOO_FAR: `지금부터 ${ADVANCE_LISTING_DAYS}일 안의 시각만 올릴 수 있어요`,
  TOO_FAR_PUBLISHED: `고객에게 이미 보이는 매물은 지금부터 ${PUBLISH_WINDOW_HOURS}시간 안의 시각으로만 바꿀 수 있어요`,
};

/** 시작 시각의 문제. 없으면 null. 지금과 같은 시각은 지난 것으로 본다 */
export function checkStart(
  start: Date,
  now: Date,
  window: StartWindow = 'advance',
): StartProblem | null {
  if (!isOnStep(start)) return 'NOT_ON_STEP';
  if (start.getTime() <= now.getTime()) return 'PAST';
  if (start.getTime() > latestStart(now, window).getTime()) {
    return window === 'published' ? 'TOO_FAR_PUBLISHED' : 'TOO_FAR';
  }
  return null;
}

/** 지금 이후 첫 단위 시각부터 마지막 시작 시각(latestStart)까지, 고를 수 있는 시작 시각 전부 */
export function startCandidates(now: Date, window: StartWindow = 'advance'): Date[] {
  const kst = utcToKst(now);
  // 지금이 들어 있는 분의 시작(한국 시간)에서 다음 단위로 올린다
  const minuteStart = kstToUtc(kst);
  const minutesOfDay = kst.hour * 60 + kst.minute;
  const toNext = SLOT_START_STEP_MINUTES - (minutesOfDay % SLOT_START_STEP_MINUTES);
  let cursor = addMinutes(minuteStart, toNext);
  const last = latestStart(now, window).getTime();
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

/** 영업시간 "HH:MM"을 자정부터 지난 분으로 바꾼다. 예: "09:30" → 570 */
const minutesOfDay = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** 그 날짜(한국 요일)를 쉬는 날로 입력했으면 true. 날짜 버튼을 잠그고, 처음 보여 줄 날짜를 고를 때 쓴다 */
export function isClosedDay(date: Date | undefined, hours: BusinessHours): boolean {
  if (!date) return false;
  const weekday = utcToKst(date).weekday;
  return hours.some((item) => item.weekday === weekday && 'closed' in item);
}

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

/** 시작 시각 후보를 한국 날짜별로 묶는다(날짜 순서 유지) */
export function groupByKstDate(starts: Date[]): { dateKey: string; starts: Date[] }[] {
  const groups = new Map<string, Date[]>();
  for (const start of starts) {
    const key = kstDateKey(start);
    groups.set(key, [...(groups.get(key) ?? []), start]);
  }
  return [...groups].map(([dateKey, items]) => ({ dateKey, starts: items }));
}
