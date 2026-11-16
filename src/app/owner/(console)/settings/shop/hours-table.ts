// 매장 설정 > 영업시간 표 계산 (#358 3번, 11/14 nnoinn). 화면('use client')과 테스트가 같이 쓴다.
// 표는 열 7개(일~토), 하루 48칸(30분, SLOT_START_STEP_MINUTES)이고, 요일별 시각 칸과 같은 값(HoursRow)을 보여 준다.
// 저장 값과 규칙은 그대로다(shop-profile.ts, 매물 계산 slots/slot-time.ts). 표는 고르는 방법이 하나 더 있는 것뿐이다.
//
// 요일별 값 → 칸(hoursGrid): 닫는 시각이 여는 시각보다 이르면 다음 날 새벽 칸까지, 같으면 24시간이다
//   (토 18:00 ~ 02:00 → 토 18~24시 + 일 0~2시, 00:00 ~ 00:00 → 그 요일 열 전체).
// 끌고 난 칸 → 요일별 값(applyGrid, #358 규칙):
// - 전날 칸이 24:00까지 켜져 있고 다음 날 칸이 00:00부터 이어지면, 이어진 새벽 칸은 전날 영업이다(토요일 → 첫 열 일요일)
// - 그 요일 칸을 모두(00:00~24:00) 켜면 24시간(00:00 ~ 00:00), 모두 끄면 쉬는 날이다
// - 하루가 끊어지면(11:00~12:00 + 13:00~15:00) 그 요일은 바꾸지 않고 split으로 알려 준다
// 규칙이 정하지 않은 경우(11/15 정민석):
// - 이어진 새벽이 전날 영업을 24시간보다 길게 만들면 전날 영업으로 보지 않는다(저장 값은 24시간을 넘을 수 없다).
//   토 18:00 ~ 00:00 다음에 일 00:00~20:00을 켜면 일 00:00 ~ 20:00이다
// - 원래 00:00에 여는 요일은 전날을 24:00까지 늘려도 그 요일 영업으로 둔다(값이 저절로 바뀌지 않게)
// - 전날 영업이 이제 24:00까지 오지 않으면 전날에서 이어진 새벽 칸도 같이 없어진다(토 18:00 ~ 02:00에서 22~24시를 끄면 토 18:00 ~ 22:00)
// - 비어 있는 요일("정보 없음")과 쉬는 날은 그 요일 칸을 켜지 않는 한 그대로다. 칸을 모두 끈 영업일만 쉬는 날이 된다
// - 30분 단위가 아닌 예전 값(10:15)이 있는 요일은 그 열과 그 요일 새벽 칸을 잠근다(lockedCells). 시각 칸에서 고친다

import { withNextDayMark } from '@/lib/time';
import { SLOT_START_STEP_MINUTES } from '@/server/policy';

import { HOURS_WEEKDAYS, type HoursRow, isHoursTime, WEEKDAY_LABELS } from './shop-profile';

const DAY_MINUTES = 24 * 60;
const STEP = SLOT_START_STEP_MINUTES;
const WEEK_DAYS = 7;

/** 하루 칸 수. 30분 칸 48개 */
export const CELLS_PER_DAY = DAY_MINUTES / STEP;

/** 켜진 칸. [요일 0=일 ~ 6=토][칸 0=00:00~00:30 … 47=23:30~24:00] */
export type HoursGrid = boolean[][];

/** 표의 칸 하나 */
export type CellPosition = { weekday: number; cell: number };

/** 한 요일 영업 구간(그 날 자정부터 지난 분). end가 1440보다 크면 다음 날 새벽까지 이어진다 */
type Span = { start: number; end: number };

const minutesOf = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const pad2 = (value: number) => String(value).padStart(2, '0');
/** 자정부터 지난 분(0~1439)을 "HH:MM"으로 */
const hm = (minutes: number) => `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
const nextWeekday = (weekday: number) => (weekday + 1) % WEEK_DAYS;
const previousWeekday = (weekday: number) => (weekday + WEEK_DAYS - 1) % WEEK_DAYS;

const emptyGrid = (): HoursGrid =>
  Array.from({ length: WEEK_DAYS }, () => Array<boolean>(CELLS_PER_DAY).fill(false));

/** 영업 구간. 쉬는 날이거나 두 시각을 다 고르지 않았으면 null. 두 시각이 같으면 24시간 */
function rowSpan(row: HoursRow | undefined): Span | null {
  if (!row || row.closed || !isHoursTime(row.open) || !isHoursTime(row.close)) return null;
  const open = minutesOf(row.open);
  const close = minutesOf(row.close);
  return { start: open, end: close > open ? close : close + DAY_MINUTES };
}

/** 30분 단위가 아닌 예전 값(예: 10:15)이 있는 영업일이면 true. 표에서 바꾸지 않는다 */
export function isOffStep(row: HoursRow | undefined): boolean {
  const span = rowSpan(row);
  return span !== null && (span.start % STEP !== 0 || span.end % STEP !== 0);
}

const rowOf = (rows: readonly HoursRow[], weekday: number) =>
  rows.find((row) => row.weekday === weekday);

/** 요일별 값을 칸으로. 새벽 영업은 다음 날 위쪽 칸까지 켠다. 30분 단위가 아닌 값은 걸치는 칸을 모두 켠다 */
export function hoursGrid(rows: readonly HoursRow[]): HoursGrid {
  const grid = emptyGrid();
  for (const row of rows) {
    const span = rowSpan(row);
    if (!span) continue;
    const last = Math.ceil(span.end / STEP);
    for (let cell = Math.floor(span.start / STEP); cell < last; cell += 1) {
      const weekday = cell < CELLS_PER_DAY ? row.weekday : nextWeekday(row.weekday);
      grid[weekday][cell % CELLS_PER_DAY] = true;
    }
  }
  return grid;
}

/** 표에서 바꿀 수 없는 칸: 30분 단위가 아닌 요일의 열 전체와, 그 요일 영업이 이어진 다음 날 새벽 칸 */
export function lockedCells(rows: readonly HoursRow[]): HoursGrid {
  const locked = emptyGrid();
  for (const row of rows) {
    const span = rowSpan(row);
    if (!span || !isOffStep(row)) continue;
    locked[row.weekday].fill(true);
    const carry = Math.ceil((span.end - DAY_MINUTES) / STEP);
    for (let cell = 0; cell < carry; cell += 1) locked[nextWeekday(row.weekday)][cell] = true;
  }
  return locked;
}

/**
 * 끌기: from 칸부터 to 칸까지의 네모(요일·시각 순서 상관없음)를 모두 켜거나(on) 끈다. 잠긴 칸은 그대로 둔다.
 * base는 끌기를 시작할 때의 칸이라, 빨리 끌어 건너뛴 칸이 없고 되돌아가면 원래대로 돌아온다(window-cells.ts paintCells와 같다)
 */
export function paintGrid(
  base: HoursGrid,
  locked: HoursGrid,
  from: CellPosition,
  to: CellPosition,
  on: boolean,
): HoursGrid {
  const next = base.map((column) => [...column]);
  const [firstDay, lastDay] = [from.weekday, to.weekday].sort((a, b) => a - b);
  const [firstCell, lastCell] = [from.cell, to.cell].sort((a, b) => a - b);
  for (let weekday = firstDay; weekday <= lastDay; weekday += 1) {
    for (let cell = firstCell; cell <= lastCell; cell += 1) {
      if (!locked[weekday][cell]) next[weekday][cell] = on;
    }
  }
  return next;
}

/** 칸에서 읽은 한 요일 영업: 이어진 한 구간(open), 그 요일 칸이 없음(none), 끊어짐(split) */
type DayReading = { kind: 'open'; span: Span } | { kind: 'none' } | { kind: 'split' };

/**
 * 칸을 요일마다 읽는다. rows(지금 값)는 잠긴 요일과 "00:00에 여는 요일"을 알 때만 쓴다.
 * 전날에서 이어진 새벽 칸 수(carry)를 먼저 정하고, 그 아래 칸에서 그 요일 영업을 찾는다
 */
function readGrid(grid: HoursGrid, rows: readonly HoursRow[]): DayReading[] {
  const spans = HOURS_WEEKDAYS.map((weekday) => rowSpan(rowOf(rows, weekday)));
  const fixed = HOURS_WEEKDAYS.map((weekday) => isOffStep(rowOf(rows, weekday)));
  const locked = lockedCells(rows);
  const usable = (weekday: number, cell: number) => grid[weekday][cell] && !locked[weekday][cell];
  const full = HOURS_WEEKDAYS.map(
    (weekday) => !fixed[weekday] && grid[weekday].every((_, cell) => usable(weekday, cell)),
  );

  /** 24:00에 끝나는 칸 묶음의 첫 칸. 24:00까지 켜져 있지 않으면 null */
  function lastRunStart(weekday: number): number | null {
    if (!usable(weekday, CELLS_PER_DAY - 1)) return null;
    let cell = CELLS_PER_DAY - 1;
    while (cell > 0 && usable(weekday, cell - 1)) cell -= 1;
    return cell;
  }

  /** 지금 값에서 전날 영업이 이 요일 새벽으로 이어진 칸 수 */
  function savedCarry(weekday: number): number {
    const span = spans[previousWeekday(weekday)];
    return span && span.end > DAY_MINUTES ? Math.ceil((span.end - DAY_MINUTES) / STEP) : 0;
  }

  /** 전날에서 이어진 새벽 칸 수(그 요일 맨 위부터) */
  function carryInto(weekday: number): number {
    const previous = previousWeekday(weekday);
    const previousReachesMidnight = usable(previous, CELLS_PER_DAY - 1) && !full[previous];
    // 잠긴 요일 열은 바뀌지 않는다. 전날이 24:00까지 오면 원래 새벽 칸 그대로다
    if (fixed[weekday]) return previousReachesMidnight ? savedCarry(weekday) : 0;
    // 잠긴 전날의 새벽 칸은 usable이 아니어서 이 요일 영업과 섞이지 않는다
    if (fixed[previous] || full[weekday] || full[previous]) return 0;
    const start = lastRunStart(previous);
    if (start === null) return 0;
    // 원래 00:00에 여는 요일은 그 요일 영업으로 둔다
    if (spans[weekday]?.start === 0) return 0;
    let length = 0;
    while (length < CELLS_PER_DAY && usable(weekday, length)) length += 1;
    // 전날 영업이 24시간을 넘으면 이어진 새벽이 아니라 그 요일 영업이다
    return length <= start ? length : 0;
  }

  const carry = HOURS_WEEKDAYS.map(carryInto);

  return HOURS_WEEKDAYS.map((weekday): DayReading => {
    if (full[weekday]) return { kind: 'open', span: { start: 0, end: DAY_MINUTES } };
    const runs: [number, number][] = [];
    for (let cell = carry[weekday]; cell < CELLS_PER_DAY; cell += 1) {
      if (!usable(weekday, cell)) continue;
      const first = cell;
      while (cell < CELLS_PER_DAY && usable(weekday, cell)) cell += 1;
      runs.push([first, cell]);
    }
    if (runs.length === 0) return { kind: 'none' };
    if (runs.length > 1) return { kind: 'split' };
    const [first, end] = runs[0];
    return {
      kind: 'open',
      span: {
        start: first * STEP,
        end: end === CELLS_PER_DAY ? DAY_MINUTES + carry[nextWeekday(weekday)] * STEP : end * STEP,
      },
    };
  });
}

const sameReading = (a: DayReading, b: DayReading) =>
  a.kind === b.kind &&
  (a.kind !== 'open' ||
    (b.kind === 'open' && a.span.start === b.span.start && a.span.end === b.span.end));

export type GridResult = {
  /** 바꾼 영업시간 줄. rows와 같은 순서 */
  rows: HoursRow[];
  /** 하루를 끊어서 골라 바꾸지 않은 요일(일~토 순서) */
  split: number[];
};

/**
 * 끌고 난 칸(painted)을 요일별 값으로 바꾼다. 칸이 바뀌었거나 읽은 값이 달라진 요일만 바꾸고,
 * 나머지 요일은 지금 값을 그대로 둔다(30분 단위가 아닌 요일은 늘 그대로다)
 */
export function applyGrid(rows: readonly HoursRow[], painted: HoursGrid): GridResult {
  const base = hoursGrid(rows);
  const grid = painted.map((column) => [...column]);

  // 전날 영업이 이제 24:00까지 오지 않거나 24시간이 되면, 전날에서 이어진 새벽 칸은 주인이 없어 지운다
  for (const weekday of HOURS_WEEKDAYS) {
    const previous = previousWeekday(weekday);
    const previousRow = rowOf(rows, previous);
    const span = rowSpan(previousRow);
    if (!span || span.end <= DAY_MINUTES || isOffStep(previousRow)) continue;
    const stillCarries = grid[previous][CELLS_PER_DAY - 1] && !grid[previous].every((on) => on);
    if (stillCarries) continue;
    for (let cell = 0; cell < (span.end - DAY_MINUTES) / STEP; cell += 1) {
      grid[weekday][cell] = false;
    }
  }

  const before = readGrid(base, rows);
  const after = readGrid(grid, rows);
  const split: number[] = [];
  const next = rows.map((row) => {
    const weekday = row.weekday;
    if (isOffStep(row)) return row;
    const changed =
      grid[weekday].some((on, cell) => on !== base[weekday][cell]) ||
      !sameReading(before[weekday], after[weekday]);
    if (!changed) return row;
    const reading = after[weekday];
    if (reading.kind === 'split') {
      split.push(weekday);
      return row;
    }
    // 그 요일 칸을 모두 끈 영업일은 쉬는 날. 시각은 남겨 두어 쉬는 날을 다시 끄면 돌아온다(요일별 칸과 같다)
    if (reading.kind === 'none') return rowSpan(row) ? { ...row, closed: true } : row;
    return {
      ...row,
      closed: false,
      open: hm(reading.span.start),
      close: hm(reading.span.end % DAY_MINUTES),
    };
  });
  return { rows: next, split: split.sort((a, b) => a - b) };
}

/** 요일 이름을 눌렀을 때: 쉬는 날을 켜고 끈다. 시각은 그대로 두어 요일별 칸의 [쉬는 날]을 끄고 켤 때와 같다 */
export function toggleClosed(rows: readonly HoursRow[], weekday: number): HoursRow[] {
  return rows.map((row) => (row.weekday === weekday ? { ...row, closed: !row.closed } : row));
}

/** 표에 그리는 막대. start·end는 그 열의 자정부터 지난 분(0~1440) */
export type HoursBar = {
  start: number;
  end: number;
  /** open: 그 요일 영업, carry: 전날에서 이어진 새벽 영업(빗금) */
  kind: 'open' | 'carry';
  /** 첫 줄. 예: "10:00", "24시간", "토 영업" */
  title: string;
  /** 둘째 줄. 예: "~ 20:00", "~ 02:00(익일)". 없으면 빈 글자 */
  detail: string;
};

/** 닫는 시각 이름. 다음 날에 닫으면 "(익일)"(TimeSelect와 같다). 예: "20:00", "02:00(익일)", "00:00(익일)" */
function closeLabel(span: Span): string {
  return span.end < DAY_MINUTES ? hm(span.end) : withNextDayMark(hm(span.end - DAY_MINUTES));
}

/** 한 요일 열의 막대: 전날에서 이어진 새벽 영업과 그 요일 영업. 쉬는 날은 그 요일 영업을 그리지 않는다 */
export function columnBars(rows: readonly HoursRow[], weekday: number): HoursBar[] {
  const bars: HoursBar[] = [];
  const previous = previousWeekday(weekday);
  const carried = rowSpan(rowOf(rows, previous));
  if (carried && carried.end > DAY_MINUTES) {
    bars.push({
      start: 0,
      end: carried.end - DAY_MINUTES,
      kind: 'carry',
      title: `${WEEKDAY_LABELS[previous]} 영업`,
      detail: `~ ${hm(carried.end - DAY_MINUTES)}`,
    });
  }
  const span = rowSpan(rowOf(rows, weekday));
  if (span) {
    const allDay = span.start === 0 && span.end === DAY_MINUTES;
    bars.push({
      start: span.start,
      end: Math.min(span.end, DAY_MINUTES),
      kind: 'open',
      title: allDay ? '24시간' : hm(span.start),
      detail: allDay ? '' : `~ ${closeLabel(span)}`,
    });
  }
  return bars;
}

/** 요일 이름 아래 적는 그 요일 값(두 줄까지). 예: ["10:00~", "20:00"], ["쉬는 날"], ["24시간"] */
export function daySummary(row: HoursRow | undefined): string[] {
  if (!row) return ['비어 있음'];
  if (row.closed) return ['쉬는 날'];
  const span = rowSpan(row);
  if (span) {
    if (span.end - span.start === DAY_MINUTES) return ['24시간'];
    return [`${row.open}~`, closeLabel(span)];
  }
  if (!row.open && !row.close) return ['비어 있음'];
  return ['시각을 다', '골라 주세요'];
}

/** 칸 이름(읽기 프로그램용). 예: "월요일 10:00~10:30", 마지막 칸은 "월요일 23:30~00:00(익일)" */
export function cellLabel(position: CellPosition): string {
  const start = position.cell * STEP;
  const end = start + STEP;
  const endLabel = end < DAY_MINUTES ? hm(end) : withNextDayMark(hm(end - DAY_MINUTES));
  return `${WEEKDAY_LABELS[position.weekday]}요일 ${hm(start)}~${endLabel}`;
}

/** 요일 목록 이름. 예: [1, 3] → "월요일·수요일" */
export function weekdayNames(weekdays: readonly number[]): string {
  return weekdays.map((weekday) => `${WEEKDAY_LABELS[weekday]}요일`).join('·');
}
