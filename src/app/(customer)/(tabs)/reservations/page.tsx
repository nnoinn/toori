import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { cn } from 'cn';
import { ChevronRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState, LoadingCards } from '@/components/ui/state';
import { formatWon } from '@/lib/format';
import { formatKst } from '@/lib/time';
import { ensureCustomerPage } from '@/server/auth';

import { getMyReservations } from './queries';
import { parseTab, RESERVATION_TABS, tabHref, type ReservationTab } from './reservation-tabs';

export const metadata: Metadata = { title: '내 예약' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const EMPTY_TEXT: Record<ReservationTab, string> = {
  upcoming: '예정된 예약이 없어요',
  completed: '이용한 예약이 없어요',
  cancelled: '취소한 예약이 없어요',
};

// 내 예약 목록 (J12, C-501). 로그인 확인은 <Suspense> 안에서 한다(기술 가이드 2장).
export default function ReservationsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 flex-col">
      <h1 className="px-4 pt-4 pb-2 text-xl font-bold">내 예약</h1>
      <Suspense fallback={<LoadingCards count={3} />}>
        <ReservationsContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ReservationsContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const tab = parseTab(params.tab);
  // 로그인하지 않았으면 로그인 화면, 약관 동의 전이면 /join 으로 보낸다
  await ensureCustomerPage(tabHref(tab));
  const result = await getMyReservations(tab);

  return (
    <>
      <nav aria-label="예약 구분" className="flex gap-1 border-b px-3">
        {RESERVATION_TABS.map((item) => (
          <Link
            key={item.key}
            href={tabHref(item.key)}
            replace
            scroll={false}
            aria-current={item.key === tab ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              item.key === tab
                ? 'border-foreground font-semibold'
                : 'border-transparent text-muted-foreground',
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {!result.ok ? (
        <ErrorState description={result.error.message} />
      ) : result.data.length === 0 ? (
        <EmptyState title={EMPTY_TEXT[tab]} />
      ) : (
        <ul className="flex flex-col divide-y">
          {result.data.map((item) => (
            <li key={item.reservationId}>
              <Link
                href={`/reservations/${item.reservationId}`}
                className="flex items-center gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="truncate">{item.shopName}</span>
                    {item.noShow ? <Badge variant="destructive">노쇼</Badge> : null}
                  </p>
                  <p className="truncate font-semibold">{item.menuName}</p>
                  <p className="text-sm">{formatKst(new Date(item.startAt))}</p>
                  <p className="text-xs text-muted-foreground">
                    예약번호 {item.code} · {formatWon(item.amount)}
                  </p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
