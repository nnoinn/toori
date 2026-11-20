// 월별 통계 달력(S-504). 일요일부터 7칸, 날 칸마다 그날 거래 칩과 그날 살린 시간(오른쪽 아래).
// - 방문 완료한 서비스는 메뉴 이름(예: "여성 커트", 여러 번이면 "여성 커트 (2)")을 초록 칩으로(11/20 정민석)
// - 노쇼·고객 취소 등은 종류별 건수 칩. 색은 정산 내역 거래 종류 배지와 같다(status-style.ts)
// 거래나 방문이 있는 날은 눌러서 그날 거래 내역(정산)으로 간다. 그 달이 아닌 앞뒤 칸은 비워 둔다.
// 서버에서 그리는 부품이라 상태가 없다. PC 기준

import Link from 'next/link';
import { cn } from 'cn';

import { calendarWeeks, partsOfKey } from '../slots/calendar-days';
import { monthRange, SETTLEMENT_KIND_LABELS } from '../settlements/settlement-format';
import { SETTLEMENT_KIND_STYLE } from '../status-style';
import { dayItemsHref, savedTimeText, serviceChipText, type StatsDay } from './stats';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

const CHIP = 'w-fit rounded-md border border-transparent px-1.5 py-0.5 text-xs font-medium';

/** 방문 완료한 서비스 칩. 투리로 채운 시간이라 브랜드 초록으로 눈에 띄게(11/20 정민석) */
const SERVICE_CHIP_STYLE = 'bg-primary/15 text-primary';

export function StatsCalendar({
  month,
  days,
  todayKey,
}: {
  /** 'YYYY-MM'(한국 달) */
  month: string;
  /** 날짜 'YYYY-MM-DD' → 그날 값. 거래도 방문도 없는 날은 없다 */
  days: Map<string, StatsDay>;
  todayKey: string;
}) {
  const { from, to } = monthRange(month);
  const weeks = calendarWeeks(from, to);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-7 gap-2 text-center text-sm font-medium text-muted-foreground">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday}>{weekday}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {weeks
          .flat()
          .map((dateKey) =>
            dateKey.startsWith(month) ? (
              <DayCell
                key={dateKey}
                dateKey={dateKey}
                day={days.get(dateKey)}
                today={dateKey === todayKey}
              />
            ) : (
              <div key={dateKey} aria-hidden />
            ),
          )}
      </div>
    </div>
  );
}

function DayCell({ dateKey, day, today }: { dateKey: string; day?: StatsDay; today: boolean }) {
  const { month, day: dayNumber } = partsOfKey(dateKey);
  const className = cn(
    'flex min-h-28 flex-col gap-1 rounded-lg border bg-card p-2',
    today && 'border-primary ring-1 ring-primary',
  );
  const number = (
    <span className={cn('text-sm font-semibold', !day && 'text-muted-foreground')}>
      {dayNumber}
    </span>
  );
  if (!day) return <div className={className}>{number}</div>;

  const summary = [
    ...day.services.map(({ menuName, count }) => `${menuName} ${count}건 방문 완료`),
    ...day.kinds.map(({ kind, count }) => `${SETTLEMENT_KIND_LABELS[kind]} ${count}건`),
    ...(day.minutes > 0 ? [`살린 시간 ${savedTimeText(day.minutes)}`] : []),
  ].join(', ');
  return (
    <Link
      href={dayItemsHref(dateKey)}
      aria-label={`${month}월 ${dayNumber}일 거래 내역 보기: ${summary}`}
      className={cn(className, 'transition-colors hover:bg-accent/40')}
    >
      {number}
      <ul className="flex flex-col gap-1">
        {day.services.map((service) => (
          <li key={`service-${service.menuName}`} className={cn(CHIP, SERVICE_CHIP_STYLE)}>
            {serviceChipText(service)}
          </li>
        ))}
        {day.kinds.map(({ kind, count }) => (
          <li key={kind} className={cn(CHIP, SETTLEMENT_KIND_STYLE[kind])}>
            {SETTLEMENT_KIND_LABELS[kind]} {count}
          </li>
        ))}
      </ul>
      {day.minutes > 0 ? (
        <span className="mt-auto self-end text-xs font-semibold text-primary tabular-nums">
          {savedTimeText(day.minutes)}
        </span>
      ) : null}
    </Link>
  );
}
