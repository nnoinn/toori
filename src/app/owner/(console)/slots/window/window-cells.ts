// 시간대 매물 ① 날짜·시간대의 시간표 계산 (#308, S-201 두 번째 방식). 화면('use client')과 테스트가 같이 쓴다.
// 고른 날의 영업시간(입력하지 않은 요일은 하루 전체)을 30분 칸(SLOT_START_STEP_MINUTES)으로 나누고,
// 드래그로 켠 칸의 이어진 묶음을 시간대 하나로 본다(예: 10:00~12:00, 13:00~18:00 → 시간대 두 개).
// 지난 시각, 14일 밖, 이미 올린 매물·시간대와 겹치는 칸은 잠그고 켜지 않는다. 서버(createSlotWindows)가 저장할 때 다시 확인한다.

import type { BusinessHours } from '@/db/schema/shops';
import { formatDuration } from '@/lib/format';
import { addMinutes, formatKstTime, kstDateKey, kstToUtc } from '@/lib/time';
import { ADVANCE_LISTING_DAYS, SLOT_START_STEP_MINUTES } from '@/server/policy';

import { partsOfKey, weekdayOfKey } from '../calendar-days';
import { latestStart, rangesOverlap, type TimeRange } from '../slot-time';

const DAY_MINUTES = 24 * 60;

/** 칸을 고를 수 없는 이유 */
export type CellLock = 'past' | 'tooFar' | 'busy';

export const CELL_LOCK_LABELS: Record<CellLock, string> = {
  past: '지난 시각',
  tooFar: `${ADVANCE_LISTING_DAYS}일 밖`,
  busy: '이미 올린 매물',
};

/** 시간표 한 칸(30분) */
export type WindowCell = { start: Date; end: Date; lock: CellLock | null };

/** "HH:MM"을 자정부터 지난 분으로. 예: "09:30" → 570 */
const minutesOfDay = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/**
 * 그 날 시간표에 놓을 범위(자정부터 지난 분). 영업시간을 입력하지 않은 요일은 하루 전체(0~24시), 쉬는 날은 null.
 * 30분 단위가 아닌 예전 영업시간(예: 10:15~20:45)은 안쪽 30분 칸(10:30~20:30)으로 맞춘다
 */
export function dayHours(
  dateKey: string,
  hours: BusinessHours,
): { open: number; close: number } | null {
  const entry = hours.find((item) => item.weekday === weekdayOfKey(dateKey));
  if (!entry) return { open: 0, close: DAY_MINUTES };
  if ('closed' in entry) return null;
  const step = SLOT_START_STEP_MINUTES;
  return {
    open: Math.ceil(minutesOfDay(entry.open) / step) * step,
    close: Math.floor(minutesOfDay(entry.close) / step) * step,
  };
}

/** 자정부터 지난 분을 "HH:MM"으로. 예: 570 → "09:30", 1440 → "24:00" */
export function minutesLabel(minutes: number): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** 그 날의 시간표 칸. 지금(서버 시각)과 이미 올린 시간(busy)으로 잠글 칸을 정한다 */
export function dayCells(
  dateKey: string,
  hours: BusinessHours,
  now: Date,
  busy: TimeRange[],
): WindowCell[] {
  const range = dayHours(dateKey, hours);
  if (!range) return [];
  const midnight = kstToUtc({ ...partsOfKey(dateKey), hour: 0, minute: 0 });
  const last = latestStart(now);
  const cells: WindowCell[] = [];
  for (let minute = range.open; minute + SLOT_START_STEP_MINUTES <= range.close;) {
    const start = addMinutes(midnight, minute);
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
    cells.push({ ...cell, lock });
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

/** 시각 "HH:MM". 그 날 자정에 끝나면 "24:00" */
function endLabel(range: TimeRange): string {
  return kstDateKey(range.end) !== kstDateKey(range.start) && formatKstTime(range.end) === '00:00'
    ? '24:00'
    : formatKstTime(range.end);
}

/** 묶음 하나. 예: "13:00~18:00" */
export function rangeLabel(range: TimeRange): string {
  return `${formatKstTime(range.start)}~${endLabel(range)}`;
}

/** 고른 시간 요약. 예: "10:00~12:00, 13:00~18:00 (총 7시간)". 아무것도 안 켰으면 null */
export function rangesSummary(ranges: readonly TimeRange[]): string | null {
  if (ranges.length === 0) return null;
  const minutes = ranges.reduce(
    (sum, range) => sum + (range.end.getTime() - range.start.getTime()) / 60_000,
    0,
  );
  return `${ranges.map(rangeLabel).join(', ')} (총 ${formatDuration(minutes)})`;
}

/** 잠긴 칸이 이어진 묶음의 첫 칸이면 그 이유. 첫 칸에만 이유를 적어 시간표가 덜 복잡하다 */
export function lockLabelAt(cells: readonly WindowCell[], index: number): string | null {
  const lock = cells[index]?.lock;
  if (!lock || cells[index - 1]?.lock === lock) return null;
  return CELL_LOCK_LABELS[lock];
}
