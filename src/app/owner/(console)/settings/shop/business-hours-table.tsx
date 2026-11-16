'use client';

// 매장 설정 > 영업시간 표 (#358 3번, 11/14 nnoinn). 영업시간 칸에서 [표로 보기]를 누르면 요일별 시각 칸 대신 보인다
// (business-hours-editor.tsx). 요일별 칸과 같은 값(HoursRow)을 그리고, 끌고 나면 7줄을 한 번에 onChange로 넘긴다.
// 표 ↔ 요일별 값 계산은 hours-table.ts 한 곳이다.
// - 표: 열 7개(일~토), 1시간 줄 24개. 1시간 줄을 앞·뒤 30분 칸으로 나누고 그 사이에 연한 점선을 긋는다. 왼쪽 시각은 1시간마다.
//   1시간 줄 높이는 시간대 매물 시간표 한 칸(h-7)과 같다
// - 켠 영업시간은 연한 브랜드 초록 막대 하나로 그리고 막대 안에 시각을 적는다. 전날에서 이어진 새벽 영업은 빗금 막대("토 영업")다
// - 끌기: 시간대 매물 시간표(slots/window/window-timetable.tsx)와 같다. 꺼진 칸에서 시작하면 켜고, 켜진 칸에서 시작하면 끈다.
//   옆 요일까지 끌면 네모 안 요일이 한 번에 바뀐다. 끄는 동안은 점선 네모와 바뀔 모양을 미리 보여 주고, 손을 떼면 값에 넣는다.
//   마우스와 터치 모두 포인터 이벤트로 받고(touch-none·select-none), 포인터를 잡아 두고 손가락 아래 칸은 elementFromPoint로 찾는다
// - 키보드: 화살표로 칸을 옮기고 Space·Enter로 켜고 끈다. Shift를 누른 채 누르면 마지막에 누른 칸부터 네모를 켠다
// - 요일 이름을 누르면 쉬는 날이 되어 글자가 연해지고 그 열이 회색이 된다. 다시 누르면 원래 시각으로 돌아온다(요일별 칸과 같다)
// - 30분 단위가 아닌 예전 값이 있는 요일은 잠그고, 시각 칸에서 고치라고 알려 준다

import { useRef, useState } from 'react';
import { cn } from 'cn';

import { SLOT_START_STEP_MINUTES } from '@/server/policy';

import {
  applyGrid,
  CELLS_PER_DAY,
  type CellPosition,
  cellLabel,
  columnBars,
  daySummary,
  type HoursBar,
  type HoursGrid,
  hoursGrid,
  isOffStep,
  lockedCells,
  paintGrid,
  toggleClosed,
  weekdayNames,
} from './hours-table';
import {
  HOURS_WEEKDAYS,
  type HoursRow,
  type ShopProfileFieldErrors,
  WEEKDAY_LABELS,
} from './shop-profile';

/** 30분 칸 높이(px). 1시간 줄 = 28px = 시간대 매물 시간표 한 칸(h-7) */
const HALF_HOUR_PX = 14;
const COLUMN_PX = HALF_HOUR_PX * CELLS_PER_DAY;
const HOURS = Array.from({ length: 25 }, (_, hour) => hour);

/** 전날에서 이어진 새벽 영업 막대의 빗금. 색은 테마 토큰(--primary)만 쓴다 */
const CARRY_STRIPES =
  'repeating-linear-gradient(135deg, color-mix(in oklab, var(--primary) 30%, transparent) 0 6px, color-mix(in oklab, var(--primary) 10%, transparent) 6px 12px)';

export const SPLIT_MESSAGE = '하루 영업시간은 이어서 한 구간만 고를 수 있어요';

type Drag = { anchor: CellPosition; last: CellPosition; on: boolean; base: HoursGrid };
type Preview = { painted: HoursGrid; from: CellPosition; to: CellPosition; on: boolean };

const samePosition = (a: CellPosition, b: CellPosition) =>
  a.weekday === b.weekday && a.cell === b.cell;

export function BusinessHoursTable({
  hours,
  errors,
  onChange,
}: {
  /** 요일별 영업시간 7줄(화면 순서 그대로 돌려준다) */
  hours: HoursRow[];
  /** 샵 정보 칸 오류 전체. 이 중 `hours.{줄 번호}`만 표 아래에 모아 보여 준다 */
  errors: ShopProfileFieldErrors;
  /** 7줄을 한 번에 바꾼다 */
  onChange: (rows: HoursRow[]) => void;
}) {
  const drag = useRef<Drag | null>(null);
  // Shift+누르기의 네모 시작. 마지막에 켜거나 끈 칸
  const lastPressed = useRef<CellPosition | null>(null);
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [focus, setFocus] = useState<CellPosition | null>(null);

  const grid = hoursGrid(hours);
  const locked = lockedCells(hours);
  // 끄는 동안은 손을 뗐을 때의 모양을 미리 그린다
  const shown = preview ? applyGrid(hours, preview.painted).rows : hours;
  const shownGrid = preview ? preview.painted : grid;
  const rowOf = (weekday: number) => shown.find((row) => row.weekday === weekday);
  const offStep = HOURS_WEEKDAYS.filter((weekday) =>
    isOffStep(hours.find((row) => row.weekday === weekday)),
  );
  const hourErrors = hours.flatMap((row, index) => {
    const error = errors[`hours.${index}`];
    return error ? [`${WEEKDAY_LABELS[row.weekday]}요일: ${error}`] : [];
  });

  const firstOpen = (() => {
    for (const weekday of HOURS_WEEKDAYS) {
      for (let cell = 0; cell < CELLS_PER_DAY; cell += 1) {
        if (!locked[weekday][cell]) return { weekday, cell };
      }
    }
    return null;
  })();
  const active = focus && !locked[focus.weekday][focus.cell] ? focus : firstOpen;

  /** 칠한 칸을 값에 넣는다. 끊어진 요일은 바꾸지 않고 안내를 보여 준다 */
  function commit(painted: HoursGrid) {
    const result = applyGrid(hours, painted);
    onChange(result.rows);
    setMessage(result.split.length > 0 ? `${SPLIT_MESSAGE}(${weekdayNames(result.split)})` : null);
  }

  /** 포인터 아래 칸. 표 밖이거나 칸이 아니면 null */
  function cellAt(clientX: number, clientY: number): CellPosition | null {
    const element = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>('[data-cell]');
    if (!element) return null;
    return { weekday: Number(element.dataset.weekday), cell: Number(element.dataset.cell) };
  }

  function press(position: CellPosition, extend: boolean) {
    if (locked[position.weekday][position.cell]) return;
    const from = extend && lastPressed.current ? lastPressed.current : position;
    // Shift는 네모를 켜기만 한다. 아니면 누른 칸이 꺼져 있으면 켜고, 켜져 있으면 끈다
    const on = extend ? true : !grid[position.weekday][position.cell];
    commit(paintGrid(grid, locked, from, position, on));
    lastPressed.current = position;
    setFocus(position);
  }

  function showPreview(current: Drag) {
    setPreview({
      painted: paintGrid(current.base, locked, current.anchor, current.last, current.on),
      from: current.anchor,
      to: current.last,
      on: current.on,
    });
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const position = cellAt(event.clientX, event.clientY);
    if (!position || locked[position.weekday][position.cell]) return;
    // 칸에 포커스가 가며 글자가 선택되거나 터치로 스크롤되지 않게 한다
    event.preventDefault();
    if (event.shiftKey) {
      press(position, true);
      return;
    }
    const current: Drag = {
      anchor: position,
      last: position,
      on: !grid[position.weekday][position.cell],
      base: grid,
    };
    drag.current = current;
    event.currentTarget.setPointerCapture(event.pointerId);
    showPreview(current);
    lastPressed.current = position;
    setFocus(position);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current) return;
    const position = cellAt(event.clientX, event.clientY);
    if (!position || samePosition(position, current.last)) return;
    current.last = position;
    showPreview(current);
  }

  /** 손을 떼면 값에 넣는다. 브라우저가 끌기를 멈추면(pointercancel) 넣지 않는다 */
  function endDrag(event: React.PointerEvent<HTMLDivElement>, keep: boolean) {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setPreview(null);
    if (keep) commit(paintGrid(current.base, locked, current.anchor, current.last, current.on));
  }

  /** 화살표 방향으로 잠기지 않은 다음 칸에 포커스를 옮긴다 */
  function moveFocus(from: CellPosition, dayStep: number, cellStep: number) {
    let { weekday, cell } = from;
    for (;;) {
      weekday += dayStep;
      cell += cellStep;
      if (weekday < 0 || weekday >= HOURS_WEEKDAYS.length || cell < 0 || cell >= CELLS_PER_DAY)
        return;
      if (locked[weekday][cell]) continue;
      setFocus({ weekday, cell });
      cellRefs.current[weekday * CELLS_PER_DAY + cell]?.focus();
      return;
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, position: CellPosition) {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    if (event.key === ' ' || event.key === 'Enter') {
      // 버튼 기본 동작(클릭)은 쓰지 않는다. 포인터로 누를 때는 onPointerDown이 처리한다
      event.preventDefault();
      press(position, event.shiftKey);
    } else if (moves[event.key]) {
      event.preventDefault();
      moveFocus(position, ...moves[event.key]);
    }
  }

  function toggleDay(weekday: number) {
    onChange(toggleClosed(hours, weekday));
    setMessage(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))] gap-x-1.5">
        <div />
        {HOURS_WEEKDAYS.map((weekday) => {
          const row = rowOf(weekday);
          const closed = row?.closed ?? false;
          return (
            <div key={weekday} className="flex flex-col items-center gap-1 pb-2 text-center">
              <button
                type="button"
                aria-pressed={closed}
                aria-label={`${WEEKDAY_LABELS[weekday]}요일 쉬는 날`}
                onClick={() => toggleDay(weekday)}
                className={cn(
                  'cursor-pointer rounded-full bg-background px-3 py-0.5 text-sm font-semibold outline-none hover:bg-primary/10 focus-visible:ring-3 focus-visible:ring-ring/50',
                  closed && 'font-medium text-muted-foreground',
                )}
              >
                {WEEKDAY_LABELS[weekday]}
              </button>
              <span className="min-h-7 text-[11px] leading-tight text-muted-foreground tabular-nums">
                {daySummary(row).map((line, index) => (
                  <span key={index} className="block">
                    {line}
                  </span>
                ))}
              </span>
            </div>
          );
        })}

        {/* 왼쪽 시각: 1시간마다. 6시간마다 진하게 */}
        <div aria-hidden className="relative" style={{ height: COLUMN_PX }}>
          {HOURS.map((hour) => (
            <span
              key={hour}
              className={cn(
                'absolute right-2 text-[11px] leading-3 tabular-nums',
                hour % 6 === 0 ? 'font-medium text-foreground' : 'text-muted-foreground',
              )}
              style={{ top: hour * HALF_HOUR_PX * 2 - 6 }}
            >
              {`${String(hour).padStart(2, '0')}:00`}
            </span>
          ))}
        </div>

        <div
          role="group"
          aria-label="영업시간 표"
          className="col-span-7 grid touch-none grid-cols-subgrid select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => endDrag(event, true)}
          onPointerCancel={(event) => endDrag(event, false)}
        >
          {HOURS_WEEKDAYS.map((weekday) => {
            const row = rowOf(weekday);
            const ghost =
              preview &&
              weekday >= Math.min(preview.from.weekday, preview.to.weekday) &&
              weekday <= Math.max(preview.from.weekday, preview.to.weekday)
                ? {
                    first: Math.min(preview.from.cell, preview.to.cell),
                    last: Math.max(preview.from.cell, preview.to.cell),
                    on: preview.on,
                  }
                : null;
            return (
              <div
                key={weekday}
                className={cn(
                  'relative flex flex-col overflow-hidden rounded-[14px] border',
                  row?.closed ? 'bg-muted' : 'bg-card',
                )}
              >
                {Array.from({ length: CELLS_PER_DAY }, (_, cell) => {
                  const position = { weekday, cell };
                  const lock = locked[weekday][cell];
                  const isActive = active !== null && samePosition(active, position);
                  return (
                    <button
                      key={cell}
                      ref={(element) => {
                        cellRefs.current[weekday * CELLS_PER_DAY + cell] = element;
                      }}
                      type="button"
                      data-weekday={weekday}
                      data-cell={cell}
                      disabled={lock}
                      aria-pressed={lock ? undefined : shownGrid[weekday][cell]}
                      aria-label={`${cellLabel(position)}${lock ? ' · 시각 칸에서 고쳐 주세요' : ''}`}
                      tabIndex={isActive ? 0 : -1}
                      onKeyDown={(event) => onKeyDown(event, position)}
                      className={cn(
                        'shrink-0 cursor-pointer outline-none hover:bg-primary/10 focus-visible:relative focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring/50',
                        // 앞 30분과 뒤 30분 사이는 연한 점선, 1시간 사이는 실선(11/14 nnoinn)
                        cell < CELLS_PER_DAY - 1 &&
                          (cell % 2 === 0
                            ? 'border-b border-dashed border-border'
                            : 'border-b border-foreground/15'),
                        lock && 'cursor-not-allowed hover:bg-transparent',
                      )}
                      style={{ height: HALF_HOUR_PX }}
                    />
                  );
                })}
                {columnBars(shown, weekday).map((bar) => (
                  <Bar key={`${bar.kind}-${bar.start}`} bar={bar} />
                ))}
                {ghost ? (
                  <div
                    aria-hidden
                    className={cn(
                      'pointer-events-none absolute inset-x-1 rounded-[10px] border-2 border-dashed',
                      ghost.on ? 'border-primary bg-primary/5' : 'border-muted-foreground',
                    )}
                    style={{
                      top: ghost.first * HALF_HOUR_PX + 1,
                      height: (ghost.last - ghost.first + 1) * HALF_HOUR_PX - 2,
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div role="alert" className="flex min-h-5 flex-col gap-1 text-sm text-destructive">
        {message ? <p>{message}</p> : null}
        {offStep.length > 0 ? (
          <p>
            {weekdayNames(offStep)}은 30분 단위가 아닌 시각이 있어서 표에서 바꿀 수 없어요.
            [돌아가기]를 눌러 시각 칸에서 고쳐 주세요.
          </p>
        ) : null}
        {hourErrors.length > 0 ? (
          <>
            {hourErrors.map((error) => (
              <p key={error}>{error}</p>
            ))}
            <p>[돌아가기]를 눌러 시각 칸에서 고쳐 주세요.</p>
          </>
        ) : null}
      </div>

      <div aria-hidden className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-3.5 rounded-[5px] bg-primary/30" />
          영업
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3.5 rounded-[5px]" style={{ backgroundImage: CARRY_STRIPES }} />
          전날에서 이어진 새벽 영업(전날 영업시간이에요)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3.5 rounded-[5px] border bg-muted" />
          쉬는 날
        </span>
      </div>
    </div>
  );
}

/** 켠 영업시간 막대. 막대 안에 시각을 적는다. 1시간 이하면 첫 줄만, 30분이면 글자 없이 */
function Bar({ bar }: { bar: HoursBar }) {
  const minutes = bar.end - bar.start;
  const top = (bar.start / SLOT_START_STEP_MINUTES) * HALF_HOUR_PX;
  const height = (minutes / SLOT_START_STEP_MINUTES) * HALF_HOUR_PX;
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-x-1 overflow-hidden rounded-[10px] text-center text-[11px] font-semibold text-accent-foreground tabular-nums',
        bar.kind === 'open' && 'bg-primary/30',
        minutes > 60 ? 'py-1.5 leading-snug' : 'leading-6',
      )}
      style={{
        top: top + 2,
        height: Math.max(height - 4, 2),
        backgroundImage: bar.kind === 'carry' ? CARRY_STRIPES : undefined,
      }}
    >
      {minutes >= 60 ? bar.title : null}
      {minutes > 60 && bar.detail ? (
        <span className="block text-[10.5px] font-medium">{bar.detail}</span>
      ) : null}
    </div>
  );
}
