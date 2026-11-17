// 예약 현황 위 줄 (S-402): [일]·[주] 고르기, [<] [오늘] [>], 보는 기간. 서버에서 그리는 부품이라 상태가 없고 주소로 옮긴다.
// 보기를 바꿔도 보던 날짜는 그대로 둔다(주 → 일이면 그 날, 일 → 주면 그 날이 든 주).

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

import {
  periodLabel,
  SCHEDULE_VIEW_LABELS,
  type ScheduleQuery,
  type ScheduleView,
  scheduleDays,
  scheduleHref,
  shiftSchedule,
} from './schedule';

const VIEWS: readonly ScheduleView[] = ['day', 'week'];

export function ScheduleNav({ query, todayKey }: { query: ScheduleQuery; todayKey: string }) {
  const previous = shiftSchedule(query, -1, todayKey);
  const next = shiftSchedule(query, 1, todayKey);
  const unit = query.view === 'week' ? '주' : '날';
  const showsToday = scheduleDays(query).includes(todayKey);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <nav aria-label="보기" className="flex gap-2">
        {VIEWS.map((view) => {
          const current = query.view === view;
          return (
            <Button key={view} asChild variant={current ? 'default' : 'outline'}>
              <Link
                href={scheduleHref({ ...query, view })}
                aria-current={current ? 'page' : undefined}
              >
                {SCHEDULE_VIEW_LABELS[view]}
              </Link>
            </Button>
          );
        })}
      </nav>
      <div className="flex items-center gap-2">
        {previous ? (
          <Button asChild variant="outline" size="icon" aria-label={`이전 ${unit}`}>
            <Link href={scheduleHref(previous)}>
              <ChevronLeft aria-hidden />
            </Link>
          </Button>
        ) : null}
        {showsToday ? (
          <Button variant="outline" disabled>
            오늘
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link href={scheduleHref({ view: query.view, dateKey: todayKey })}>오늘</Link>
          </Button>
        )}
        {next ? (
          <Button asChild variant="outline" size="icon" aria-label={`다음 ${unit}`}>
            <Link href={scheduleHref(next)}>
              <ChevronRight aria-hidden />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="icon" disabled aria-label={`다음 ${unit}`}>
            <ChevronRight aria-hidden />
          </Button>
        )}
      </div>
      <h2 className="text-lg font-semibold">{periodLabel(scheduleDays(query))}</h2>
    </div>
  );
}
