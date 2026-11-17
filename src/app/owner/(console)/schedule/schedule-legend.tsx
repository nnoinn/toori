// 예약 현황 색 설명 (S-402). 칸 색은 대시보드 배지·예약 상세와 같다(status-style.ts). 서버에서 그리는 부품이다.

import { cn } from 'cn';

import { SLOT_STATUS_LABELS } from '@/features/slot-status/slot-status';

import { RESERVATION_VIEW_LABELS } from '../reservations/reservation-detail';
import { RESERVATION_VIEW_STYLE, SLOT_STATUS_STYLE } from '../status-style';

/** 색 이름. 마감과 취소는 같은 색이라 한 칸으로 묶는다 */
const ITEMS: { label: string; tone: string }[] = [
  { label: SLOT_STATUS_LABELS.scheduled, tone: SLOT_STATUS_STYLE.scheduled },
  { label: SLOT_STATUS_LABELS.published, tone: SLOT_STATUS_STYLE.published },
  { label: `예약 ${RESERVATION_VIEW_LABELS.upcoming}`, tone: RESERVATION_VIEW_STYLE.upcoming },
  { label: RESERVATION_VIEW_LABELS.needsVisit, tone: RESERVATION_VIEW_STYLE.needsVisit },
  { label: RESERVATION_VIEW_LABELS.visited, tone: RESERVATION_VIEW_STYLE.visited },
  { label: RESERVATION_VIEW_LABELS.noShow, tone: RESERVATION_VIEW_STYLE.noShow },
  {
    label: `${SLOT_STATUS_LABELS.closed}·${SLOT_STATUS_LABELS.cancelled}`,
    tone: SLOT_STATUS_STYLE.closed,
  },
];

export function ScheduleLegend() {
  return (
    <ul aria-label="칸 색" className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {ITEMS.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn('size-3 rounded-sm ring-1 ring-foreground/10', item.tone)}
          />
          {item.label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-3 rounded-sm border border-dashed border-primary/50 bg-primary/5"
        />
        시간대 매물
      </li>
    </ul>
  );
}
