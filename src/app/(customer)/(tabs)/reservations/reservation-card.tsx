import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatReservationCode } from '@/components/ui/reservation-code';
import { formatWon } from '@/lib/format';
import { formatKst, formatKstTime } from '@/lib/time';

import type { MyReservationListItem } from './queries';

/**
 * [내 예약] 목록의 예약 하나 = 흰 카드 하나(#359 2번). 카드 어디를 눌러도 예약 상세로 간다.
 * PC: 원장님 대시보드의 매물 줄처럼 세 칸(왼쪽 시간, 가운데 샵·서비스·뱃지, 오른쪽 금액·예약번호).
 * 폰: 샵 → 서비스 → 시간 → 예약번호·금액을 한 칸에 위에서 아래로
 */
export function ReservationCard({
  item,
  visitPending,
}: {
  item: MyReservationListItem;
  /** 시작 시각이 지났는데 원장님이 아직 방문·노쇼를 처리하지 않음 */
  visitPending: boolean;
}) {
  const start = formatKst(new Date(item.startAt));
  const end = formatKstTime(new Date(item.endAt));
  const code = formatReservationCode(item.code);

  return (
    <Card
      size="sm"
      className="py-0 transition-shadow hover:ring-foreground/20 has-focus-visible:ring-2 has-focus-visible:ring-ring"
    >
      <Link
        href={`/reservations/${item.reservationId}`}
        className="flex items-center gap-3 p-4 outline-none md:gap-5"
      >
        <div className="hidden w-32 shrink-0 md:block">
          <p className="font-semibold">{start}</p>
          <p className="text-muted-foreground">~ {end}</p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">{item.shopName}</span>
            {item.noShow ? <Badge variant="destructive">노쇼</Badge> : null}
            {visitPending ? <Badge variant="secondary">방문 확인 중</Badge> : null}
          </p>
          <p className="truncate text-base font-semibold">{item.menuName}</p>
          <p className="md:hidden">
            {start} ~ {end}
          </p>
          <p className="text-xs text-muted-foreground md:hidden">
            예약번호 {code} · {formatWon(item.amount)}
          </p>
        </div>
        <div className="hidden shrink-0 flex-col items-end gap-0.5 md:flex">
          <p className="text-base font-semibold">{formatWon(item.amount)}</p>
          <p className="text-xs text-muted-foreground tabular-nums">예약번호 {code}</p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </Card>
  );
}
