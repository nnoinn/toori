'use client';

// 시간대 매물 ① 드래그 시간표 (#308). 30분 칸을 세로로 놓고, 끌어서 켜고 끈다(엑셀에서 칸을 고르듯이).
// - 끌기: 꺼진 칸에서 시작하면 켜고, 켜진 칸에서 시작하면 끈다. 시작한 칸부터 지금 칸까지를 통째로 바꿔서(paintCells)
//   빨리 끌어 건너뛴 칸이 없고, 되돌아가면 원래대로 돌아온다. 여러 번 끌어 여러 범위를 켤 수 있다
// - 마우스와 터치(태블릿) 모두 포인터 이벤트로 받는다. 시간표에 touch-none을 줘서 끄는 동안 화면이 스크롤되지 않고,
//   select-none으로 글자가 선택되지 않는다. 포인터를 잡아 두고(setPointerCapture) 손가락 아래 칸은 elementFromPoint로 찾는다
// - 키보드: 위·아래 화살표로 칸을 옮기고, Space·Enter로 켜고 끈다. Shift를 누른 채 누르면 마지막에 누른 칸부터 범위를 켠다
// - 잠긴 칸(지난 시각, 14일 밖, 이미 올린 매물·시간대)은 회색 막대로 이유를 적고, 끌어도 켜지지 않는다
// 모양(11/22 정민석): 칸 묶음마다 둥근 카드(영업시간 표처럼 30분 사이는 연한 점선, 1시간 사이는 실선)이고, 고른 시간은
// 진한 초록 둥근 막대 안에 묶음 시간(예: 13:00~18:00)을 적는다. 색과 왼쪽 시각(30분마다, 정각은 진하게)은 예전 그대로다.
// 칸 높이는 30분 28px이고, 끄는 동안 바로 칠한다(점선 미리보기는 쓰지 않는다).
// 칸이 24개(12시간)보다 많으면(영업시간을 입력하지 않은 요일, 긴 새벽 영업) 두 줄로 나눠 한눈에 보이게 한다.
// 새벽까지 여는 샵(11/11 nnoinn)은 전날에서 이어진 새벽 칸과 그 날 영업 칸 사이를 띄우고, 다음 날 새벽 칸 위에 날짜를 적는다.

import { Fragment, useRef, useState } from 'react';
import { cn } from 'cn';

import { formatKstTime } from '@/lib/time';

import { addDaysToKey } from '../calendar-days';
import { dateKeyLabel } from '../slot-date-calendar';
import {
  CELL_LOCK_LABELS,
  paintCells,
  rangeLabel,
  segmentBars,
  type TimetableBar,
  timetableSegments,
  type WindowCell,
} from './window-cells';

/** 이보다 칸이 많으면 두 줄로 나눈다 */
const ONE_COLUMN_MAX_CELLS = 24;
/** 30분 칸 높이(px). 영업시간 표의 1시간 줄과 같다 */
const CELL_PX = 28;

type Drag = { anchor: number; on: boolean; base: ReadonlySet<number>; last: number };

export function WindowTimetable({
  dateKey,
  cells,
  selected,
  onChange,
}: {
  /** 고른 날짜. 다음 날 새벽 칸에 "(익일)"을 붙일 때 쓴다 */
  dateKey: string;
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

  const columns = cells.length > ONE_COLUMN_MAX_CELLS ? 2 : 1;
  const rowsPerColumn = Math.ceil(cells.length / columns);
  const segments = timetableSegments(cells, rowsPerColumn);
  const columnSegments = Array.from({ length: columns }, (_, column) =>
    segments.filter((segment) => Math.floor(segment.first / rowsPerColumn) === column),
  );

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
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-label="시간표"
        className="grid touch-none items-start gap-x-4 select-none"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {columnSegments.map((list, column) => (
          <div key={column} className="flex flex-col">
            {list.map((segment, order) => {
              const first = cells[segment.first];
              const count = segment.last - segment.first + 1;
              // 다음 날 새벽이 시작하는 덩어리 위에는 날짜를 적는다(칸 이름에도 "(익일)"이 붙는다)
              const dayChange =
                first.nextDay && (segment.first === 0 || !cells[segment.first - 1].nextDay);
              return (
                <Fragment key={first.start.toISOString()}>
                  {dayChange ? (
                    <p
                      aria-hidden
                      className={cn(
                        'pb-1 pl-[3.25rem] text-xs font-medium text-muted-foreground',
                        order > 0 && 'pt-3',
                      )}
                    >
                      익일 · {dateKeyLabel(addDaysToKey(dateKey, 1))}
                    </p>
                  ) : order > 0 ? (
                    <div aria-hidden className="h-3" />
                  ) : null}
                  <div className="grid grid-cols-[3.25rem_1fr]">
                    {/* 왼쪽 시각: 30분마다, 정각은 진하게 */}
                    <div aria-hidden className="flex flex-col">
                      {Array.from({ length: count }, (_, offset) => {
                        const time = formatKstTime(cells[segment.first + offset].start);
                        return (
                          <span
                            key={offset}
                            className={cn(
                              'pr-2 text-right text-xs leading-7 tabular-nums',
                              time.endsWith(':00')
                                ? 'font-medium text-foreground'
                                : 'text-muted-foreground',
                            )}
                            style={{ height: CELL_PX }}
                          >
                            {time}
                          </span>
                        );
                      })}
                    </div>
                    <div className="relative flex flex-col overflow-hidden rounded-[14px] border bg-card">
                      {Array.from({ length: count }, (_, offset) => {
                        const index = segment.first + offset;
                        const cell = cells[index];
                        // 앞 30분과 뒤 30분 사이는 연한 점선, 1시간 사이는 실선(영업시간 표와 같다)
                        return (
                          <button
                            key={index}
                            ref={(element) => {
                              cellRefs.current[index] = element;
                            }}
                            type="button"
                            data-cell={index}
                            disabled={cell.lock !== null}
                            aria-pressed={cell.lock ? undefined : selected.has(index)}
                            aria-label={`${rangeLabel(cell, dateKey)}${cell.lock ? ` · ${CELL_LOCK_LABELS[cell.lock]}` : ''}`}
                            tabIndex={index === activeIndex ? 0 : -1}
                            onKeyDown={(event) => onKeyDown(event, index)}
                            className={cn(
                              'shrink-0 cursor-pointer outline-none hover:bg-primary/10 focus-visible:relative focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset',
                              cell.lock && 'cursor-not-allowed hover:bg-transparent',
                            )}
                            style={{ height: CELL_PX }}
                          />
                        );
                      })}
                      {segmentBars(cells, selected, segment, dateKey).map((bar) => (
                        <Bar key={`${bar.kind}-${bar.from}`} bar={bar} />
                      ))}
                      {/* 칸 사이 줄은 막대 위에 겹쳐 그려서 막대 안에서도 보인다.
                          앞 30분과 뒤 30분 사이는 연한 점선, 1시간 사이는 실선(영업시간 표와 같다) */}
                      {Array.from({ length: count - 1 }, (_, offset) => (
                        <div
                          key={offset}
                          aria-hidden
                          className={cn(
                            'pointer-events-none absolute inset-x-0 border-t',
                            formatKstTime(cells[segment.first + offset].end).endsWith(':00')
                              ? 'border-foreground/15'
                              : 'border-dashed border-border',
                          )}
                          style={{ top: (offset + 1) * CELL_PX - 1 }}
                        />
                      ))}
                    </div>
                  </div>
                </Fragment>
              );
            })}
          </div>
        ))}
      </div>

      <div aria-hidden className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-3.5 rounded-[5px] bg-primary" />
          고른 시간
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3.5 rounded-[5px] bg-muted" />
          고를 수 없는 시간
        </span>
      </div>
    </div>
  );
}

/** 고른 시간(진한 초록)과 잠긴 시간(회색) 둥근 막대. 막대 첫 줄에 묶음 시간이나 잠긴 이유를 적는다 */
function Bar({ bar }: { bar: TimetableBar }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-x-1 truncate rounded-[10px] px-2 text-left text-xs leading-6 tabular-nums',
        bar.kind === 'selected'
          ? 'bg-primary font-semibold text-primary-foreground'
          : 'bg-muted text-muted-foreground',
      )}
      style={{ top: bar.from * CELL_PX + 2, height: bar.cells * CELL_PX - 4 }}
    >
      {bar.label}
    </div>
  );
}
