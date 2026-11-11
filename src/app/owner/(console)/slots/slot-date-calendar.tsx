'use client';

// 매물 등록 ② 날짜 달력 (S-205). 맨 위에 오늘 날짜를 알려 주고, 일요일부터 토요일까지 7칸 달력에 고를 수 있는 날짜만
// 누를 수 있게 둔다(오늘부터 14일, 게시중 매물을 고칠 때는 48시간). 쉬는 날은 "휴무"로 잠근다.
// 날짜를 고르면 달력 아래에 그 날의 시작 시각이 나온다(slot-form-steps.tsx TimeStep).

import { cn } from 'cn';

import type { BusinessHours } from '@/db/schema/shops';

import { WEEKDAY_LABELS } from '../settings/shop/shop-profile';
import { calendarWeeks, monthRangeLabel, partsOfKey, weekdayOfKey } from './calendar-days';
import { isClosedDay } from './slot-time';

/** 날짜 이름. 예: "11월 14일(토)" */
export function dateKeyLabel(key: string): string {
  const { month, day } = partsOfKey(key);
  return `${month}월 ${day}일(${WEEKDAY_LABELS[weekdayOfKey(key)]})`;
}

export function SlotDateCalendar({
  todayKey,
  days,
  selectedKey,
  businessHours,
  onChoose,
}: {
  /** 오늘(한국 날짜, 서버 시각 기준) */
  todayKey: string;
  /** 고를 수 있는 날짜와 그 날의 시작 시각 후보(가까운 날부터) */
  days: { dateKey: string; starts: Date[] }[];
  /** 고른 날짜. 아직 안 골랐으면 null */
  selectedKey: string | null;
  businessHours: BusinessHours;
  onChoose: (dateKey: string) => void;
}) {
  const choosable = new Map(days.map((item) => [item.dateKey, item.starts[0]]));
  const lastKey = days.at(-1)?.dateKey ?? todayKey;
  const weeks = calendarWeeks(todayKey, lastKey);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm">
          오늘은 <strong>{dateKeyLabel(todayKey)}</strong>이에요
        </p>
        <p className="text-sm font-semibold">{monthRangeLabel(todayKey, lastKey)}</p>
      </div>

      <div role="group" aria-label="날짜" className="grid grid-cols-7 gap-1.5">
        {WEEKDAY_LABELS.map((label, weekday) => (
          <span
            key={label}
            aria-hidden
            className={cn(
              'pb-1 text-center text-xs font-medium text-muted-foreground',
              weekday === 0 && 'text-destructive/80',
            )}
          >
            {label}
          </span>
        ))}
        {weeks.flat().map((key) => {
          const firstStart = choosable.get(key);
          const closed = firstStart ? isClosedDay(firstStart, businessHours) : false;
          return (
            <DayCell
              key={key}
              dateKey={key}
              isToday={key === todayKey}
              // 고를 수 있는 범위 밖(오늘 전, 14일 뒤)이거나 쉬는 날이면 누를 수 없다
              disabled={!firstStart || closed}
              closed={closed}
              selected={key === selectedKey}
              onChoose={onChoose}
            />
          );
        })}
      </div>
    </div>
  );
}

/** 달력 한 칸. 1일이면 "12/1"처럼 달을 붙여 달이 바뀐 것을 알려 준다 */
function DayCell({
  dateKey,
  isToday,
  disabled,
  closed,
  selected,
  onChoose,
}: {
  dateKey: string;
  isToday: boolean;
  disabled: boolean;
  closed: boolean;
  selected: boolean;
  onChoose: (dateKey: string) => void;
}) {
  const { month, day } = partsOfKey(dateKey);
  // 오늘이 쉬는 날이어도 "오늘"을 같이 보여준다(#307)
  const note = [isToday && '오늘', closed && '휴무'].filter(Boolean).join(' · ') || null;
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${dateKeyLabel(dateKey)}${isToday ? ', 오늘' : ''}${closed ? ', 휴무' : ''}`}
      onClick={() => onChoose(dateKey)}
      className={cn(
        'flex h-14 flex-col items-center justify-center gap-0.5 rounded-lg border text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        'disabled:cursor-not-allowed disabled:border-transparent disabled:text-muted-foreground/50',
        !disabled && !selected && 'bg-card hover:bg-muted',
        // 오늘은 고를 수 없어도(쉬는 날, 오늘 시작 시각이 다 지남) 초록 테두리를 남긴다(#307)
        isToday && !selected && 'border-primary disabled:border-primary',
        selected && 'border-primary bg-primary font-semibold text-primary-foreground',
      )}
    >
      <span>{day === 1 ? `${month}/${day}` : day}</span>
      {note ? <span className="text-[11px] leading-none">{note}</span> : null}
    </button>
  );
}
