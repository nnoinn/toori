// 시간대 매물 ① 날짜·시간대의 시간표 계산 (#308, S-201 두 번째 방식). 화면('use client')과 테스트가 같이 쓴다.
// 고른 날의 영업 구간(slot-time.ts openSpans, 입력하지 않은 요일은 하루 전체)을 30분 칸(SLOT_START_STEP_MINUTES)으로 나누고,
// 드래그로 켠 칸의 이어진 묶음을 시간대 하나로 본다(예: 10:00~12:00, 13:00~18:00 → 시간대 두 개).
// 새벽까지 여는 샵(11/11 nnoinn)은 그 날 아래에 다음 날 새벽 칸이 이어지고(18:00 ~ 다음 날 02:00을 시간대 하나로 올릴 수 있다),
// 맨 위에는 전날 영업이 이어진 새벽 칸이 온다(그 날짜의 매물이다).
// 지난 시각, 14일 밖, 이미 올린 매물·시간대와 겹치는 칸은 잠그고 켜지 않는다. 서버(createSlotWindows)가 저장할 때 다시 확인한다.

import type { BusinessHours } from '@/db/schema/shops';
import { formatDuration } from '@/lib/format';
import { addMinutes, formatKstTime, kstDateKey, kstToUtc } from '@/lib/time';
import { ADVANCE_LISTING_DAYS, SLOT_START_STEP_MINUTES } from '@/server/policy';

import { partsOfKey } from '../calendar-days';
import { latestStart, type OpenSpan, openSpans, rangesOverlap, type TimeRange } from '../slot-time';

const DAY_MINUTES = 24 * 60;
const NEXT_DAY = '다음 날';

/** 칸을 고를 수 없는 이유 */
export type CellLock = 'past' | 'tooFar' | 'busy';

export const CELL_LOCK_LABELS: Record<CellLock, string> = {
  past: '지난 시각',
  tooFar: `${ADVANCE_LISTING_DAYS}일 밖`,
  busy: '이미 올린 매물',
};

/** 시간표 한 칸(30분). nextDay는 고른 날의 다음 날 새벽 칸(그 날 영업이 자정을 넘겨 이어진 칸) */
export type WindowCell = { start: Date; end: Date; lock: CellLock | null; nextDay: boolean };

/**
 * 그 날 시간표에 놓을 영업 구간(그 날 자정부터 지난 분, 시간 순서). 영업시간을 입력하지 않은 요일은 하루 전체(0~24시),
 * 쉬는 날은 전날에서 이어진 새벽만(없으면 빈 목록). 30분 단위가 아닌 예전 영업시간(예: 10:15~20:45)은 안쪽 30분 칸(10:30~20:30)으로 맞춘다
 */
export function daySpans(dateKey: string, hours: BusinessHours): OpenSpan[] {
  const step = SLOT_START_STEP_MINUTES;
  return (openSpans(dateKey, hours) ?? [{ start: 0, end: DAY_MINUTES }])
    .map((span) => ({
      start: Math.ceil(span.start / step) * step,
      end: Math.floor(span.end / step) * step,
    }))
    .filter((span) => span.start < span.end);
}

/** 자정부터 지난 분을 "HH:MM"으로. 예: 570 → "09:30", 1440 → "24:00", 1560 → "다음 날 02:00" */
export function minutesLabel(minutes: number): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  if (minutes > DAY_MINUTES) return `${NEXT_DAY} ${minutesLabel(minutes - DAY_MINUTES)}`;
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** 영업 구간 이름. 예: "18:00~다음 날 02:00" */
export function spanLabel(span: OpenSpan): string {
  return `${minutesLabel(span.start)}~${minutesLabel(span.end)}`;
}

/** 그 날의 시간표 칸. 지금(서버 시각)과 이미 올린 시간(busy)으로 잠글 칸을 정한다 */
export function dayCells(
  dateKey: string,
  hours: BusinessHours,
  now: Date,
  busy: TimeRange[],
): WindowCell[] {
  const midnight = kstToUtc({ ...partsOfKey(dateKey), hour: 0, minute: 0 });
  const last = latestStart(now);
  const cells: WindowCell[] = [];
  for (const span of daySpans(dateKey, hours)) {
    for (let minute = span.start; minute + SLOT_START_STEP_MINUTES <= span.end;) {
      const start = addMinutes(midnight, minute);
      const nextDay = minute >= DAY_MINUTES;
      minute += SLOT_START_STEP_MINUTES;
      const cell = { start, end: addMinutes(midnight, minute) };
      // 지금과 같은 시각에 시작하는 칸도 지난 것으로 본다(checkStart와 같다)
      const lock: CellLock | null =
        start.getTime() <= now.getTime()
          ? 'past'
          : start.getTime() > last.getTime()
            ? 'tooFar'
            : busy.some((item) => rangesOverlap(cell, item))
              ? 'busy'
              : null;
      cells.push({ ...cell, lock, nextDay });
    }
  }
  return cells;
}

/**
 * 드래그나 Shift+누르기: from 칸부터 to 칸까지(순서 상관없음) 잠기지 않은 칸을 모두 켜거나(on) 끈다.
 * base는 드래그를 시작할 때 켜져 있던 칸이다. 그래서 빨리 끌어서 건너뛴 칸이 있어도, 되돌아가면 원래대로 돌아온다
 */
export function paintCells(
  base: ReadonlySet<number>,
  cells: readonly WindowCell[],
  from: number,
  to: number,
  on: boolean,
): Set<number> {
  const next = new Set(base);
  const [low, high] = from <= to ? [from, to] : [to, from];
  for (let index = low; index <= high; index += 1) {
    if (!cells[index] || cells[index].lock) continue;
    if (on) next.add(index);
    else next.delete(index);
  }
  return next;
}

/** 켜진 칸의 이어진 묶음. 꺼진 칸이나 잠긴 칸에서 끊긴다. 묶음 하나가 시간대 하나다 */
export function selectedRanges(
  cells: readonly WindowCell[],
  selected: ReadonlySet<number>,
): TimeRange[] {
  const ranges: TimeRange[] = [];
  cells.forEach((cell, index) => {
    if (!selected.has(index) || cell.lock) return;
    const previous = ranges.at(-1);
    if (previous && selected.has(index - 1) && previous.end.getTime() === cell.start.getTime()) {
      previous.end = cell.end;
    } else {
      ranges.push({ start: cell.start, end: cell.end });
    }
  });
  return ranges;
}

/** 끝 시각. 시작한 날 자정에 끝나면 "24:00", 다음 날로 넘어가면 "다음 날 02:00" */
function endLabel(range: TimeRange): string {
  if (kstDateKey(range.end) === kstDateKey(range.start)) return formatKstTime(range.end);
  return formatKstTime(range.end) === '00:00' ? '24:00' : `${NEXT_DAY} ${formatKstTime(range.end)}`;
}

/**
 * 묶음 하나. 예: "13:00~18:00", "22:00~다음 날 02:00".
 * dateKey(고른 날)를 주면 그 다음 날에 시작하는 묶음 앞에 "다음 날"을 붙인다(예: "다음 날 00:30~02:00")
 */
export function rangeLabel(range: TimeRange, dateKey?: string): string {
  const prefix = dateKey && kstDateKey(range.start) !== dateKey ? `${NEXT_DAY} ` : '';
  return `${prefix}${formatKstTime(range.start)}~${endLabel(range)}`;
}

/** 고른 시간 요약. 예: "10:00~12:00, 13:00~18:00 (총 7시간)". 아무것도 안 켰으면 null */
export function rangesSummary(ranges: readonly TimeRange[], dateKey?: string): string | null {
  if (ranges.length === 0) return null;
  const minutes = ranges.reduce(
    (sum, range) => sum + (range.end.getTime() - range.start.getTime()) / 60_000,
    0,
  );
  return `${ranges.map((range) => rangeLabel(range, dateKey)).join(', ')} (총 ${formatDuration(minutes)})`;
}

/** 잠긴 칸이 이어진 묶음의 첫 칸이면 그 이유. 첫 칸에만 이유를 적어 시간표가 덜 복잡하다 */
export function lockLabelAt(cells: readonly WindowCell[], index: number): string | null {
  const lock = cells[index]?.lock;
  if (!lock || cells[index - 1]?.lock === lock) return null;
  return CELL_LOCK_LABELS[lock];
}
