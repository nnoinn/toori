import { describe, expect, it } from 'vitest';

import {
  applyGrid,
  cellLabel,
  columnBars,
  daySummary,
  hoursGrid,
  isOffStep,
  lockedCells,
  paintGrid,
  toggleClosed,
  weekdayNames,
} from './hours-table';
import { type HoursRow, toHoursRows } from './shop-profile';

// weekday 0=일 ~ 6=토. 칸 번호는 30분마다 하나(0=00:00, 20=10:00, 36=18:00, 47=23:30)
const SUN = 0;
const MON = 1;
const WED = 3;
const THU = 4;
const FRI = 5;
const SAT = 6;

/** 요일별 값. 입력하지 않은 요일은 빈 줄(화면과 같은 일~토 순서) */
function hours(entries: Record<number, [string, string] | 'closed'>): HoursRow[] {
  return toHoursRows([]).map((row) => {
    const entry = entries[row.weekday];
    if (!entry) return row;
    if (entry === 'closed') return { ...row, closed: true };
    return { ...row, open: entry[0], close: entry[1] };
  });
}

const rowOf = (rows: HoursRow[], weekday: number) => rows.find((row) => row.weekday === weekday)!;

/** 켜진 칸 번호 목록 */
const onCells = (column: boolean[]) => column.flatMap((on, cell) => (on ? [cell] : [])).join(',');

/** 칸 from부터 to까지(포함) 번호 목록 */
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index).join(',');

/** rows 위에서 네모 하나를 끌었을 때의 결과 */
function drag(
  rows: HoursRow[],
  from: [weekday: number, cell: number],
  to: [weekday: number, cell: number],
  on: boolean,
) {
  const painted = paintGrid(
    hoursGrid(rows),
    lockedCells(rows),
    { weekday: from[0], cell: from[1] },
    { weekday: to[0], cell: to[1] },
    on,
  );
  return applyGrid(rows, painted);
}

describe('요일별 값 → 칸 (#358)', () => {
  it('10:00 ~ 20:00은 그 요일 10시~20시 칸', () => {
    const grid = hoursGrid(hours({ [MON]: ['10:00', '20:00'] }));
    expect(onCells(grid[MON])).toBe(range(20, 39));
    expect(onCells(grid[THU])).toBe('');
  });

  it('새벽 영업: 토 18:00 ~ 02:00이면 토요일 18~24시와 첫 열 일요일 0~2시 칸이 켜진다', () => {
    const grid = hoursGrid(hours({ [SAT]: ['18:00', '02:00'] }));
    expect(onCells(grid[SAT])).toBe(range(36, 47));
    expect(onCells(grid[SUN])).toBe(range(0, 3));
  });

  it('24시간: 00:00 ~ 00:00이면 그 요일 칸 전체, 10:00 ~ 10:00이면 다음 날 10시까지', () => {
    const allDay = hoursGrid(hours({ [MON]: ['00:00', '00:00'] }));
    expect(onCells(allDay[MON])).toBe(range(0, 47));
    expect(onCells(allDay[2])).toBe('');
    const fromTen = hoursGrid(hours({ [MON]: ['10:00', '10:00'] }));
    expect(onCells(fromTen[MON])).toBe(range(20, 47));
    expect(onCells(fromTen[2])).toBe(range(0, 19));
  });

  it('쉬는 날은 시각이 남아 있어도 칸이 없고, 한쪽만 고른 요일도 칸이 없다', () => {
    const rows = hours({ [MON]: ['10:00', '20:00'], [WED]: ['10:00', ''] }).map((row) =>
      row.weekday === MON ? { ...row, closed: true } : row,
    );
    const grid = hoursGrid(rows);
    expect(onCells(grid[MON])).toBe('');
    expect(onCells(grid[WED])).toBe('');
  });
});

describe('끌기 (#358, 시간대 매물 시간표와 같다)', () => {
  it('시작 칸과 지금 칸 사이 네모를 칠한다. 거꾸로 끌어도 같고, 잠긴 칸은 그대로 둔다', () => {
    const rows = hours({ [2]: ['18:15', '02:15'] });
    const base = hoursGrid(rows);
    // 수 00:30 ~ 월 01:30 쪽으로 거꾸로 끌어서 켜기
    const painted = paintGrid(
      base,
      lockedCells(rows),
      { weekday: WED, cell: 3 },
      { weekday: MON, cell: 1 },
      true,
    );
    expect(onCells(painted[MON])).toBe(range(1, 3));
    // 화요일은 잠겨서 원래 칸 그대로(00:00~ 칸은 꺼진 채)
    expect(onCells(painted[2])).toBe(range(36, 47));
    // 수요일 위쪽은 화요일 새벽 칸(잠김)
    expect(onCells(painted[WED])).toBe(range(0, 4));
    expect(onCells(painted[THU])).toBe('');
    // 끄기도 잠긴 칸은 그대로
    const erased = paintGrid(
      base,
      lockedCells(rows),
      { weekday: 2, cell: 40 },
      { weekday: WED, cell: 47 },
      false,
    );
    expect(erased).toEqual(base);
  });
});

describe('끌고 난 칸 → 요일별 값 (#358)', () => {
  it('바꾸지 않으면 지금 값 그대로다(새벽 영업·24시간·쉬는 날·빈 요일)', () => {
    const rows = hours({
      [SUN]: 'closed',
      [MON]: ['10:00', '20:00'],
      [WED]: ['00:00', '00:00'],
      [THU]: ['10:00', '10:00'],
      [SAT]: ['18:00', '02:00'],
    });
    expect(applyGrid(rows, hoursGrid(rows))).toEqual({ rows, split: [] });
  });

  it('칸을 켜서 영업시간을 고른다. 옆 요일까지 끌면 여러 요일이 한 번에 바뀐다', () => {
    const rows = hours({ [MON]: ['10:00', '20:00'], [2]: ['10:00', '20:00'] });
    // 월·화 20:00~21:00 켜기
    const result = drag(rows, [MON, 40], [2, 41], true);
    expect(rowOf(result.rows, MON)).toMatchObject({ open: '10:00', close: '21:00' });
    expect(rowOf(result.rows, 2)).toMatchObject({ open: '10:00', close: '21:00' });
    // 빈 요일(목)에 11:00~15:00 켜기
    const thursday = drag(rows, [THU, 22], [THU, 29], true);
    expect(rowOf(thursday.rows, THU)).toEqual({
      weekday: THU,
      closed: false,
      open: '11:00',
      close: '15:00',
    });
  });

  it('새벽 영업: 토 18:00부터 일 02:00까지 이어서 고르면 "토 18:00 ~ 02:00", 비어 있던 일요일은 그대로', () => {
    // 토 18:00~24:00 켜기 → 토 18:00 ~ 00:00(자정 마감)
    const first = drag(hours({}), [SAT, 36], [SAT, 47], true);
    expect(rowOf(first.rows, SAT)).toMatchObject({ closed: false, open: '18:00', close: '00:00' });
    // 일 00:00~02:00 켜기 → 이어진 새벽은 토요일 영업
    const second = drag(first.rows, [SUN, 0], [SUN, 3], true);
    expect(rowOf(second.rows, SAT)).toMatchObject({ open: '18:00', close: '02:00' });
    expect(rowOf(second.rows, SUN)).toEqual({ weekday: SUN, closed: false, open: '', close: '' });
  });

  it('새벽 영업: 일요일 새벽 칸을 늘리거나 줄이면 토요일 닫는 시각이 바뀌고, 쉬는 일요일은 쉬는 날 그대로다', () => {
    const rows = hours({ [SUN]: 'closed', [SAT]: ['18:00', '02:00'] });
    const longer = drag(rows, [SUN, 4], [SUN, 5], true);
    expect(rowOf(longer.rows, SAT)).toMatchObject({ open: '18:00', close: '03:00' });
    expect(rowOf(longer.rows, SUN)).toMatchObject({ closed: true });
    const shorter = drag(rows, [SUN, 2], [SUN, 3], false);
    expect(rowOf(shorter.rows, SAT)).toMatchObject({ open: '18:00', close: '01:00' });
  });

  it('새벽 영업: 토 18:00 ~ 02:00에서 22~24시를 끄면 일요일 새벽 칸도 없어져 토 18:00 ~ 22:00', () => {
    const rows = hours({ [SUN]: ['10:00', '19:00'], [SAT]: ['18:00', '02:00'] });
    const result = drag(rows, [SAT, 44], [SAT, 47], false);
    expect(rowOf(result.rows, SAT)).toMatchObject({ open: '18:00', close: '22:00' });
    expect(rowOf(result.rows, SUN)).toMatchObject({ closed: false, open: '10:00', close: '19:00' });
    expect(result.split).toEqual([]);
  });

  it('새벽 영업이 24시간을 넘으면 그 요일 영업이다: 토 18:00 ~ 00:00 + 일 00:00~20:00', () => {
    const rows = hours({ [SAT]: ['18:00', '00:00'] });
    const result = drag(rows, [SUN, 0], [SUN, 39], true);
    expect(rowOf(result.rows, SAT)).toMatchObject({ open: '18:00', close: '00:00' });
    expect(rowOf(result.rows, SUN)).toMatchObject({ closed: false, open: '00:00', close: '20:00' });
  });

  it('원래 00:00에 여는 요일은 전날을 24:00까지 늘려도 그 요일 영업이다', () => {
    const rows = hours({ [FRI]: ['10:00', '20:00'], [SAT]: ['00:00', '05:00'] });
    const result = drag(rows, [FRI, 40], [FRI, 47], true);
    expect(rowOf(result.rows, FRI)).toMatchObject({ open: '10:00', close: '00:00' });
    expect(rowOf(result.rows, SAT)).toMatchObject({ open: '00:00', close: '05:00' });
  });

  it('24시간: 한 요일 칸을 모두 켜면 00:00 ~ 00:00, 모든 칸을 켜면 매일 24시간이다', () => {
    const rows = hours({ [SUN]: ['10:00', '19:00'], [MON]: ['10:00', '20:00'] });
    const monday = drag(rows, [MON, 0], [MON, 47], true);
    expect(rowOf(monday.rows, MON)).toMatchObject({ closed: false, open: '00:00', close: '00:00' });
    expect(rowOf(monday.rows, SUN)).toMatchObject({ open: '10:00', close: '19:00' });
    const everyDay = drag(rows, [SUN, 0], [SAT, 47], true);
    expect(everyDay.rows.map((row) => `${row.open}~${row.close}`)).toEqual(
      Array(7).fill('00:00~00:00'),
    );
  });

  it('쉬는 날: 영업일 칸을 모두 끄면 쉬는 날이 되고, 시각은 남겨 둔다', () => {
    const rows = hours({ [MON]: ['10:00', '20:00'] });
    const result = drag(rows, [MON, 0], [MON, 47], false);
    expect(rowOf(result.rows, MON)).toEqual({
      weekday: MON,
      closed: true,
      open: '10:00',
      close: '20:00',
    });
    // 빈 요일은 아무 칸도 없으니 끄기를 해도 그대로다
    expect(rowOf(result.rows, THU)).toEqual({ weekday: THU, closed: false, open: '', close: '' });
  });

  it('끊어진 선택: 11:00~12:00 + 13:00~15:00처럼 끊기면 그 요일은 바꾸지 않고 알려 준다', () => {
    const rows = hours({ [MON]: ['11:00', '12:00'], [2]: ['11:00', '12:00'] });
    // 월 13:00~15:00 켜기 → 월요일 끊어짐
    const result = drag(rows, [MON, 26], [MON, 29], true);
    expect(result.split).toEqual([MON]);
    expect(rowOf(result.rows, MON)).toMatchObject({ open: '11:00', close: '12:00' });
    // 월~수 14:00~15:00을 끄면 월·화 둘 다 끊어져 바뀌지 않는다(빈 수요일은 끌 칸이 없다)
    const wide = hours({ [MON]: ['10:00', '20:00'], [2]: ['10:00', '20:00'] });
    const middle = drag(wide, [MON, 28], [WED, 29], false);
    expect(middle.split).toEqual([MON, 2]);
    expect(rowOf(middle.rows, 2)).toMatchObject({ open: '10:00', close: '20:00' });
  });

  it('30분 단위가 아닌 요일은 열과 새벽 칸을 잠그고 바꾸지 않는다', () => {
    const rows = hours({ [2]: ['18:15', '02:15'], [WED]: ['10:00', '20:00'] });
    expect(isOffStep(rowOf(rows, 2))).toBe(true);
    expect(isOffStep(rowOf(rows, WED))).toBe(false);
    const locked = lockedCells(rows);
    expect(onCells(locked[2])).toBe(range(0, 47));
    expect(onCells(locked[WED])).toBe(range(0, 4));
    // 화요일 칸을 끄려 해도 그대로
    expect(drag(rows, [2, 40], [2, 47], false).rows).toEqual(rows);
    // 수요일 02:30~10:00 켜기 → 잠긴 새벽 칸 아래부터 수요일 영업
    const result = drag(rows, [WED, 0], [WED, 19], true);
    expect(rowOf(result.rows, WED)).toMatchObject({ open: '02:30', close: '20:00' });
    expect(rowOf(result.rows, 2)).toMatchObject({ open: '18:15', close: '02:15' });
  });
});

describe('표 그리기', () => {
  it('새벽 영업은 그 요일 막대와 다음 날 빗금 막대("토 영업")로 그린다', () => {
    const rows = hours({ [SAT]: ['18:00', '02:00'], [SUN]: 'closed' });
    expect(columnBars(rows, SAT)).toEqual([
      { start: 1080, end: 1440, kind: 'open', title: '18:00', detail: '~ 02:00(익일)' },
    ]);
    expect(columnBars(rows, SUN)).toEqual([
      { start: 0, end: 120, kind: 'carry', title: '토 영업', detail: '~ 02:00' },
    ]);
  });

  it('24시간과 자정 마감', () => {
    const rows = hours({ [MON]: ['00:00', '00:00'], [2]: ['18:00', '00:00'] });
    expect(columnBars(rows, MON)).toEqual([
      { start: 0, end: 1440, kind: 'open', title: '24시간', detail: '' },
    ]);
    expect(columnBars(rows, 2)).toEqual([
      { start: 1080, end: 1440, kind: 'open', title: '18:00', detail: '~ 00:00(익일)' },
    ]);
    expect(columnBars(rows, WED)).toEqual([]);
  });

  it('요일 이름 아래 값', () => {
    const rows = hours({
      [SUN]: 'closed',
      [MON]: ['10:00', '20:00'],
      [2]: ['18:00', '02:00'],
      [WED]: ['10:00', '10:00'],
      [THU]: ['10:00', ''],
    });
    expect(daySummary(rowOf(rows, SUN))).toEqual(['쉬는 날']);
    expect(daySummary(rowOf(rows, MON))).toEqual(['10:00~', '20:00']);
    expect(daySummary(rowOf(rows, 2))).toEqual(['18:00~', '02:00(익일)']);
    expect(daySummary(rowOf(rows, WED))).toEqual(['24시간']);
    expect(daySummary(rowOf(rows, THU))).toEqual(['시각을 다', '골라 주세요']);
    expect(daySummary(rowOf(rows, FRI))).toEqual(['비어 있음']);
  });

  it('요일 이름을 누르면 쉬는 날, 다시 누르면 원래 시각으로 돌아온다', () => {
    const rows = hours({ [MON]: ['10:00', '20:00'] });
    const closed = toggleClosed(rows, MON);
    expect(rowOf(closed, MON)).toEqual({
      weekday: MON,
      closed: true,
      open: '10:00',
      close: '20:00',
    });
    expect(rowOf(toggleClosed(closed, MON), MON)).toEqual(rowOf(rows, MON));
  });

  it('칸 이름과 요일 목록', () => {
    expect(cellLabel({ weekday: MON, cell: 20 })).toBe('월요일 10:00~10:30');
    expect(cellLabel({ weekday: SAT, cell: 47 })).toBe('토요일 23:30~00:00(익일)');
    expect(weekdayNames([MON, WED])).toBe('월요일·수요일');
  });
});
