import { describe, expect, it } from 'vitest';

import type { BusinessHours } from '@/db/schema/shops';
import { formatKstTime } from '@/lib/time';

import {
  dayCells,
  daySpans,
  lockLabelAt,
  minutesLabel,
  paintCells,
  rangeLabel,
  rangesSummary,
  selectedRanges,
  spanLabel,
} from './window-cells';

const kst = (iso: string) => new Date(`${iso}+09:00`);
// 2026-11-12는 목요일(4)
const THURSDAY = '2026-11-12';
const hours: BusinessHours = [
  { weekday: 4, open: '10:00', close: '14:00' },
  { weekday: 0, closed: true },
];
const now = kst('2026-11-12T10:10:00');
const starts = (cells: { start: Date }[]) => cells.map((cell) => formatKstTime(cell.start));

describe('시간대 매물 ① 시간표 (#308)', () => {
  it('영업시간을 30분 칸으로, 입력하지 않은 요일은 하루 전체, 쉬는 날은 없음', () => {
    expect(daySpans(THURSDAY, hours)).toEqual([{ start: 600, end: 840 }]);
    // 금요일은 입력하지 않았다
    expect(daySpans('2026-11-13', hours)).toEqual([{ start: 0, end: 1440 }]);
    expect(daySpans('2026-11-15', hours)).toEqual([]);
    expect(minutesLabel(570)).toBe('09:30');
    expect(minutesLabel(1440)).toBe('24:00');
    expect(minutesLabel(1560)).toBe('다음 날 02:00');
    // 30분 단위가 아닌 예전 값은 안쪽 칸으로
    expect(daySpans(THURSDAY, [{ weekday: 4, open: '10:15', close: '13:45' }])).toEqual([
      { start: 630, end: 810 },
    ]);
  });

  it('새벽까지 영업(11/11): 전날에서 이어진 새벽은 맨 위, 그 날 영업은 다음 날 새벽 칸까지', () => {
    // 수 18:00 ~ 목 02:00, 목 20:00 ~ 금 01:00
    const night: BusinessHours = [
      { weekday: 3, open: '18:00', close: '02:00' },
      { weekday: 4, open: '20:00', close: '01:00' },
    ];
    const spans = daySpans(THURSDAY, night);
    expect(spans.map(spanLabel)).toEqual(['00:00~02:00', '20:00~다음 날 01:00']);
    const cells = dayCells(THURSDAY, night, now, []);
    expect(starts(cells)).toEqual([
      '00:00',
      '00:30',
      '01:00',
      '01:30',
      '20:00',
      '20:30',
      '21:00',
      '21:30',
      '22:00',
      '22:30',
      '23:00',
      '23:30',
      '00:00',
      '00:30',
    ]);
    expect(cells.map((cell) => cell.nextDay)).toEqual([...Array(12).fill(false), true, true]);
    // 새벽 칸은 지금(목 10:10)보다 이르니 지난 시각
    expect(cells.slice(0, 4).every((cell) => cell.lock === 'past')).toBe(true);
    // 자정을 넘겨도 이어진 칸은 시간대 하나
    const ranges = selectedRanges(cells, new Set([10, 11, 12, 13]));
    expect(ranges.map((range) => rangeLabel(range, THURSDAY))).toEqual(['23:00~다음 날 01:00']);
    // 다음 날에 시작하는 묶음에는 "다음 날"
    expect(rangesSummary(selectedRanges(cells, new Set([13])), THURSDAY)).toBe(
      '다음 날 00:30~01:00 (총 30분)',
    );
    // 쉬는 날이어도 전날에서 이어진 새벽은 남는다
    expect(daySpans(THURSDAY, [night[0], { weekday: 4, closed: true }]).map(spanLabel)).toEqual([
      '00:00~02:00',
    ]);
  });

  it('칸: 지난 시각(지금과 같은 시작 포함), 이미 올린 시간과 겹치는 칸은 잠근다', () => {
    const busy = [{ start: kst('2026-11-12T12:00:00'), end: kst('2026-11-12T13:00:00') }];
    const cells = dayCells(THURSDAY, hours, now, busy);
    expect(starts(cells)).toEqual([
      '10:00',
      '10:30',
      '11:00',
      '11:30',
      '12:00',
      '12:30',
      '13:00',
      '13:30',
    ]);
    expect(cells.map((cell) => cell.lock)).toEqual([
      'past',
      null,
      null,
      null,
      'busy',
      'busy',
      null,
      null,
    ]);
    const atStart = dayCells(THURSDAY, hours, kst('2026-11-12T10:30:00'), []);
    expect(atStart[1].lock).toBe('past');
    expect(dayCells('2026-11-15', hours, now, [])).toEqual([]);
  });

  it('14일 밖에서 시작하는 칸은 잠근다', () => {
    // 지금부터 14일 뒤 = 11/26 10:10. 그 뒤에 시작하는 칸은 잠긴다
    const cells = dayCells('2026-11-26', hours, now, []);
    expect(cells[0].lock).toBeNull();
    expect(cells[1].lock).toBe('tooFar');
  });

  it('하루 전체 시간표의 마지막 칸은 자정에 끝나고 "24:00"으로 보인다', () => {
    const cells = dayCells('2026-11-13', hours, now, []);
    expect(cells).toHaveLength(48);
    expect(rangeLabel(cells[47])).toBe('23:30~24:00');
  });

  it('드래그: 시작한 칸부터 지금 칸까지 잠기지 않은 칸을 켜고, 되돌아가면 시작할 때 값으로', () => {
    const busy = [{ start: kst('2026-11-12T12:00:00'), end: kst('2026-11-12T13:00:00') }];
    const cells = dayCells(THURSDAY, hours, now, busy);
    // 10:30부터 아래로 13:30까지 끌기. 잠긴 12:00·12:30과 지난 10:00은 켜지지 않는다
    const painted = paintCells(new Set(), cells, 1, 7, true);
    expect([...painted].sort()).toEqual([1, 2, 3, 6, 7]);
    // 거꾸로 끌어도 같다
    expect(paintCells(new Set(), cells, 7, 1, true)).toEqual(painted);
    // 켜진 칸에서 시작하면 끈다
    expect([...paintCells(painted, cells, 2, 3, false)].sort()).toEqual([1, 6, 7]);
    // 시작할 때 값(base)은 그대로 둔다
    expect(paintCells(painted, cells, 1, 1, true)).toEqual(painted);
  });

  it('켜진 칸의 이어진 묶음이 시간대 하나. 요약은 묶음과 총 시간', () => {
    const cells = dayCells(THURSDAY, hours, now, []);
    const ranges = selectedRanges(cells, new Set([1, 2, 3, 6, 7]));
    expect(ranges.map((range) => rangeLabel(range))).toEqual(['10:30~12:00', '13:00~14:00']);
    expect(rangesSummary(ranges)).toBe('10:30~12:00, 13:00~14:00 (총 2시간 30분)');
    expect(rangesSummary([])).toBeNull();
  });

  it('잠긴 칸 이유는 이어진 묶음의 첫 칸에만', () => {
    const busy = [{ start: kst('2026-11-12T12:00:00'), end: kst('2026-11-12T13:00:00') }];
    const cells = dayCells(THURSDAY, hours, now, busy);
    expect(cells.map((_, index) => lockLabelAt(cells, index))).toEqual([
      '지난 시각',
      null,
      null,
      null,
      '이미 올린 매물',
      null,
      null,
      null,
    ]);
  });
});
