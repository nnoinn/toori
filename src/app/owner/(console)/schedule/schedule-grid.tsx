// 예약 현황 타임라인 (S-402). 날마다 세로 열 하나(주 보기 7열, 일 보기 1열), 왼쪽에 1시간마다 시각.
// - 매물 칸: 시작~끝, 메뉴 이름, 예약자 이름(예약이 있으면) 또는 상태. 색은 대시보드 배지·예약 상세와 같다(status-style.ts)
// - 시간대 매물(#308)은 열 뒤쪽의 띠로 그리고, 그 안에서 결제가 끝난 칸은 매물 칸으로 위에 그린다
// - 칸을 누르면 예약 상세나 매물 수정으로 간다(slotHref). 갈 곳이 없는 칸은 누를 수 없다
// - 오늘 열 머리를 강조하고 지금 시각에 선을 긋는다(서버가 화면을 연 시각). 서버에서 그리는 부품이라 상태가 없다. PC 기준

import Link from 'next/link';
import { cn } from 'cn';

import { formatReservationCode } from '@/components/ui/reservation-code';
import { SLOT_STATUS_LABELS } from '@/features/slot-status/slot-status';
import { formatWon } from '@/lib/format';
import { formatEndTime, formatKstTime } from '@/lib/time';

import { RESERVATION_VIEW_LABELS } from '../reservations/reservation-detail';
import { minutesLabel } from '../slots/window/window-cells';
import { RESERVATION_VIEW_STYLE, SLOT_STATUS_STYLE } from '../status-style';
import {
  dayLabel,
  type MinuteRange,
  type Placed,
  type ScheduleQuery,
  type ScheduleSlot,
  type ScheduleWindow,
  scheduleHref,
  slotHref,
} from './schedule';

/** 1시간 줄 높이(px). 30분 칸이 24px로 매물 등록 시간표와 비슷하다 */
const HOUR_PX = 48;

const px = (minutes: number, range: MinuteRange) => ((minutes - range.start) / 60) * HOUR_PX;

type Column = {
  dateKey: string;
  /** 쉬는 날(그 요일을 쉬는 날로 입력했고 전날 영업이 새벽까지 이어지지도 않음). 머리에 "휴무", 열을 흐리게 */
  closed: boolean;
  slots: Placed<ScheduleSlot>[];
  windows: Placed<ScheduleWindow>[];
};

export function ScheduleGrid({
  view,
  columns,
  range,
  todayKey,
  nowMinute,
}: {
  view: ScheduleQuery['view'];
  columns: Column[];
  range: MinuteRange;
  todayKey: string;
  /** 오늘 자정부터 지난 분(지금 시각 선). 오늘이 보는 날에 없으면 무시한다 */
  nowMinute: number;
}) {
  const height = px(range.end, range);
  const hours = Array.from(
    { length: (range.end - range.start) / 60 + 1 },
    (_, index) => range.start + index * 60,
  );
  const template = { gridTemplateColumns: `4.5rem repeat(${columns.length}, minmax(0, 1fr))` };

  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="grid border-b" style={template}>
        <div />
        {columns.map(({ dateKey, closed }) => {
          const today = dateKey === todayKey;
          return (
            <div
              key={dateKey}
              className="flex flex-col items-center gap-0.5 border-l px-2 py-2 text-center"
            >
              {view === 'week' ? (
                <Link
                  href={scheduleHref({ view: 'day', dateKey })}
                  className={cn(
                    'inline-flex rounded-md px-2 py-0.5 text-sm font-medium hover:bg-muted',
                    today && 'bg-primary text-primary-foreground hover:bg-primary/90',
                  )}
                  aria-label={`${dayLabel(dateKey)}${today ? ', 오늘' : ''} 하루 보기`}
                >
                  {dayLabel(dateKey)}
                </Link>
              ) : (
                <span
                  className={cn(
                    'inline-flex rounded-md px-2 py-0.5 text-sm font-medium',
                    today && 'bg-primary text-primary-foreground',
                  )}
                >
                  {dayLabel(dateKey)}
                  {today ? ' 오늘' : ''}
                </span>
              )}
              {closed ? <span className="text-xs text-muted-foreground">휴무</span> : null}
            </div>
          );
        })}
      </div>

      <div className="grid" style={template}>
        <div className="relative" style={{ height }} aria-hidden>
          {hours.map((minute) => (
            <span
              key={minute}
              className="absolute right-2 -translate-y-1/2 text-xs text-muted-foreground tabular-nums first:translate-y-0 last:-translate-y-full"
              style={{ top: px(minute, range) }}
            >
              {minutesLabel(minute)}
            </span>
          ))}
        </div>

        {columns.map((column) => (
          <DayColumn
            key={column.dateKey}
            view={view}
            column={column}
            range={range}
            hours={hours}
            height={height}
            nowMinute={column.dateKey === todayKey ? nowMinute : null}
          />
        ))}
      </div>
    </div>
  );
}

function DayColumn({
  view,
  column,
  range,
  hours,
  height,
  nowMinute,
}: {
  view: ScheduleQuery['view'];
  column: Column;
  range: MinuteRange;
  hours: number[];
  height: number;
  nowMinute: number | null;
}) {
  return (
    <section
      aria-label={`${dayLabel(column.dateKey)}${column.closed ? ', 휴무' : ''}`}
      className={cn('relative border-l', column.closed && 'bg-muted/50')}
      style={{ height }}
    >
      {hours.slice(1, -1).map((minute) => (
        <div
          key={minute}
          aria-hidden
          className="absolute inset-x-0 border-t border-border/70"
          style={{ top: px(minute, range) }}
        />
      ))}

      {column.windows.map((placed) => (
        <WindowBand key={placed.item.id} placed={placed} range={range} />
      ))}

      {column.slots.map((placed) => (
        <SlotBlock key={placed.item.id} view={view} placed={placed} range={range} />
      ))}

      {nowMinute !== null && nowMinute >= range.start && nowMinute <= range.end ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-destructive"
          style={{ top: px(nowMinute, range) }}
        />
      ) : null}
    </section>
  );
}

/** 시간대 매물 띠: 열 폭 전체, 연한 점선 테두리. 위쪽에 "시간대 · 서비스 N개 · 상태" */
function WindowBand({ placed, range }: { placed: Placed<ScheduleWindow>; range: MinuteRange }) {
  const window = placed.item;
  const label = `시간대 ${formatKstTime(new Date(window.startAt))}~${formatEndTime(window.startAt, window.endAt)} · 서비스 ${window.menuCount}개 · ${SLOT_STATUS_LABELS[window.status]}`;
  return (
    <div
      className={cn(
        'absolute inset-x-1 overflow-hidden rounded-md border border-dashed px-1.5 py-1 text-xs',
        window.status === 'closed'
          ? 'border-muted-foreground/40 bg-muted/40 text-muted-foreground'
          : 'border-primary/50 bg-primary/5 text-primary',
      )}
      style={{
        top: px(placed.top, range),
        height: px(placed.bottom, range) - px(placed.top, range),
      }}
      title={label}
    >
      {label}
    </div>
  );
}

/** 매물 칸. 겹치면 폭을 나눠 나란히 놓는다. 갈 곳이 있으면 링크 */
function SlotBlock({
  view,
  placed,
  range,
}: {
  view: ScheduleQuery['view'];
  placed: Placed<ScheduleSlot>;
  range: MinuteRange;
}) {
  const slot = placed.item;
  const href = slotHref(slot);
  const time = `${formatKstTime(new Date(slot.startAt))}~${formatEndTime(slot.startAt, slot.endAt)}`;
  const state = slotStateText(slot);
  const who = slot.reservation?.customerName ?? null;
  const price = `정가 ${formatWon(slot.listPrice)} · ${slot.discountRate}% → ${formatWon(slot.salePrice)}`;
  const code = slot.reservation ? `예약번호 ${formatReservationCode(slot.reservation.code)}` : null;
  const summary = [time, slot.menuName, who ? `예약자 ${who}` : null, state]
    .filter(Boolean)
    .join(', ');
  const tone = slot.reservation
    ? RESERVATION_VIEW_STYLE[slot.reservation.view]
    : SLOT_STATUS_STYLE[slot.status];
  const style = {
    top: px(placed.top, range) + 1,
    height: Math.max(px(placed.bottom, range) - px(placed.top, range) - 2, 18),
    left: `calc(${(placed.lane / placed.lanes) * 100}% + 4px)`,
    width: `calc(${100 / placed.lanes}% - 8px)`,
  };
  // 상태 색 중에 반투명한 것이 있어서, 뒤의 시간 줄이 비치지 않게 바탕(bg-card) 위에 색을 얹는다
  const className = cn(
    'absolute z-10 block overflow-hidden rounded-md bg-card text-left text-xs leading-tight shadow-xs ring-1 ring-foreground/10',
    href &&
      'hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
  );
  // 주 보기(좁은 열): 시각 / 메뉴 / 예약자·상태 세 줄. 일 보기(넓은 열): 한 줄에 이어 쓰고 둘째 줄에 금액·예약번호
  const body =
    view === 'week' ? (
      <span className={cn('flex size-full flex-col px-1.5 py-1', tone)}>
        <span className="truncate font-medium tabular-nums">{time}</span>
        <span className="truncate font-semibold">{slot.menuName}</span>
        <span className="truncate opacity-80">{who ? `${who} · ${state}` : state}</span>
      </span>
    ) : (
      <span className={cn('flex size-full flex-col gap-0.5 px-2 py-1.5', tone)}>
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium tabular-nums">{time}</span>
          <span className="font-semibold">{slot.menuName}</span>
          {who ? <span>{who}</span> : null}
          <span className="opacity-80">{state}</span>
        </span>
        <span className="truncate opacity-80">{[price, code].filter(Boolean).join(' · ')}</span>
      </span>
    );

  return href ? (
    <Link href={href} className={className} style={style} title={summary} aria-label={summary}>
      {body}
    </Link>
  ) : (
    <div className={className} style={style} title={summary}>
      {body}
    </div>
  );
}

/** 칸 아래 상태 글자: 예약이 있으면 예약 상태(예정·방문 처리 필요·방문 완료·노쇼·취소), 없으면 매물 상태와 결제 중 */
function slotStateText(slot: ScheduleSlot): string {
  if (slot.reservation) return RESERVATION_VIEW_LABELS[slot.reservation.view];
  const status = SLOT_STATUS_LABELS[slot.status];
  return slot.onHold ? `${status} · 결제 중` : status;
}
