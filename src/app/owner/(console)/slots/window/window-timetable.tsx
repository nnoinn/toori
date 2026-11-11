'use client';

// 시간대 매물 ① 드래그 시간표 (#308). 30분 칸을 세로로 놓고, 끌어서 켜고 끈다(엑셀에서 칸을 고르듯이).
// - 끌기: 꺼진 칸에서 시작하면 켜고, 켜진 칸에서 시작하면 끈다. 시작한 칸부터 지금 칸까지를 통째로 바꿔서(paintCells)
//   빨리 끌어 건너뛴 칸이 없고, 되돌아가면 원래대로 돌아온다. 여러 번 끌어 여러 범위를 켤 수 있다
// - 마우스와 터치(태블릿) 모두 포인터 이벤트로 받는다. 시간표에 touch-none을 줘서 끄는 동안 화면이 스크롤되지 않고,
//   select-none으로 글자가 선택되지 않는다. 포인터를 잡아 두고(setPointerCapture) 손가락 아래 칸은 elementFromPoint로 찾는다
// - 키보드: 위·아래 화살표로 칸을 옮기고, Space·Enter로 켜고 끈다. Shift를 누른 채 누르면 마지막에 누른 칸부터 범위를 켠다
// - 잠긴 칸(지난 시각, 14일 밖, 이미 올린 매물·시간대)은 회색이고, 끌어도 켜지지 않는다
// 칸이 24개(12시간)보다 많으면(영업시간을 입력하지 않은 요일) 두 줄로 나눠 한눈에 보이게 한다.

import { useRef, useState } from 'react';
import { cn } from 'cn';

import { formatKstTime } from '@/lib/time';

import {
  CELL_LOCK_LABELS,
  lockLabelAt,
  paintCells,
  rangeLabel,
  selectedRanges,
  type WindowCell,
} from './window-cells';

/** 이보다 칸이 많으면 두 줄로 나눈다 */
const ONE_COLUMN_MAX_CELLS = 24;

type Drag = { anchor: number; on: boolean; base: ReadonlySet<number>; last: number };

export function WindowTimetable({
  cells,
  selected,
  onChange,
}: {
  cells: WindowCell[];
  /** 켜진 칸(cells의 번호) */
  selected: ReadonlySet<number>;
  onChange: (next: Set<number>) => void;
}) {
  const drag = useRef<Drag | null>(null);
  // Shift+누르기의 범위 시작. 마지막에 켜거나 끈 칸
  const lastPressed = useRef<number | null>(null);
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const firstOpen = cells.findIndex((cell) => !cell.lock);
  // 키보드로 들어오는 칸(한 칸만 Tab으로 들어오고, 그 안에서는 화살표로 옮긴다)
  const [focusIndex, setFocusIndex] = useState(firstOpen);
  const activeIndex = cells[focusIndex] && !cells[focusIndex].lock ? focusIndex : firstOpen;

  // 켜진 묶음의 첫 칸에는 그 묶음 시간을 적는다(예: 13:00~18:00)
  const rangeStarts = new Map(
    selectedRanges(cells, selected).map((range) => [
      cells.findIndex((cell) => cell.start.getTime() === range.start.getTime()),
      rangeLabel(range),
    ]),
  );

  const columns = cells.length > ONE_COLUMN_MAX_CELLS ? 2 : 1;
  const rowsPerColumn = Math.ceil(cells.length / columns);

  /** 포인터 아래 칸 번호. 시간표 밖이거나 칸이 아니면 null */
  function cellAt(clientX: number, clientY: number): number | null {
    const element = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>('[data-cell]');
    return element ? Number(element.dataset.cell) : null;
  }

  function press(index: number, extend: boolean) {
    const cell = cells[index];
    if (!cell || cell.lock) return;
    const from = extend && lastPressed.current !== null ? lastPressed.current : index;
    // Shift는 범위를 켜기만 한다. 아니면 누른 칸이 꺼져 있으면 켜고, 켜져 있으면 끈다
    const on = extend ? true : !selected.has(index);
    onChange(paintCells(selected, cells, from, index, on));
    lastPressed.current = index;
    setFocusIndex(index);
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const index = cellAt(event.clientX, event.clientY);
    if (index === null || cells[index].lock) return;
    // 칸에 포커스가 가며 글자가 선택되거나 터치로 스크롤되지 않게 한다
    event.preventDefault();
    if (event.shiftKey) {
      press(index, true);
      return;
    }
    const on = !selected.has(index);
    drag.current = { anchor: index, on, base: selected, last: index };
    event.currentTarget.setPointerCapture(event.pointerId);
    onChange(paintCells(selected, cells, index, index, on));
    lastPressed.current = index;
    setFocusIndex(index);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current) return;
    const index = cellAt(event.clientX, event.clientY);
    if (index === null || index === current.last) return;
    current.last = index;
    onChange(paintCells(current.base, cells, current.anchor, index, current.on));
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  /** 위·아래로 잠기지 않은 다음 칸에 포커스를 옮긴다 */
  function moveFocus(from: number, step: 1 | -1) {
    for (let index = from + step; index >= 0 && index < cells.length; index += step) {
      if (cells[index].lock) continue;
      setFocusIndex(index);
      cellRefs.current[index]?.focus();
      return;
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === ' ' || event.key === 'Enter') {
      // 버튼 기본 동작(클릭)은 쓰지 않는다. 포인터로 누를 때는 onPointerDown이 처리한다
      event.preventDefault();
      press(index, event.shiftKey);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveFocus(index, event.key === 'ArrowDown' ? 1 : -1);
    }
  }

  return (
    <div
      role="group"
      aria-label="시간표"
      className="grid touch-none gap-x-4 select-none"
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rowsPerColumn}, auto)`,
        gridAutoFlow: 'column',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {cells.map((cell, index) => {
        const on = selected.has(index) && !cell.lock;
        const time = formatKstTime(cell.start);
        const onHour = time.endsWith(':00');
        // 정각에서 끝나는 칸 아래에 진한 줄을 그어 한 시간씩 나눠 보이게 한다
        const endsOnHour = formatKstTime(cell.end).endsWith(':00');
        const label = cell.lock ? lockLabelAt(cells, index) : (rangeStarts.get(index) ?? null);
        return (
          <div
            key={cell.start.toISOString()}
            className="grid grid-cols-[3.25rem_1fr] items-stretch"
          >
            <span
              className={cn(
                'pr-2 text-right text-xs leading-7 tabular-nums',
                onHour ? 'font-medium text-foreground' : 'text-muted-foreground',
              )}
              aria-hidden
            >
              {time}
            </span>
            <button
              ref={(element) => {
                cellRefs.current[index] = element;
              }}
              type="button"
              data-cell={index}
              disabled={cell.lock !== null}
              aria-pressed={cell.lock ? undefined : on}
              aria-label={`${rangeLabel(cell)}${cell.lock ? ` · ${CELL_LOCK_LABELS[cell.lock]}` : ''}`}
              tabIndex={index === activeIndex ? 0 : -1}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                'relative h-7 cursor-pointer truncate border-x border-b px-2 text-left text-xs outline-none focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring/50',
                endsOnHour && 'border-b-foreground/25',
                (index === 0 || index === rowsPerColumn) && 'rounded-t-md border-t',
                (index === cells.length - 1 || index === rowsPerColumn - 1) && 'rounded-b-md',
                on
                  ? 'border-x-primary bg-primary font-semibold text-primary-foreground'
                  : 'bg-card hover:bg-primary/10',
                cell.lock && 'cursor-not-allowed bg-muted text-muted-foreground hover:bg-muted',
              )}
            >
              {label}
            </button>
          </div>
        );
      })}
    </div>
  );
}
