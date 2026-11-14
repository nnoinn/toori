import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { cn } from 'cn';

import { buttonVariants } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingCards } from '@/components/ui/state';
import { getRequestNow } from '@/lib/request-time';
import { ensureCustomerPage } from '@/server/auth';
import { CUSTOMER_HOME } from '@/server/auth/paths';

import { getMyReservations } from './queries';
import { ReservationCard } from './reservation-card';
import {
  isVisitPending,
  parseTab,
  RESERVATION_TABS,
  statusOfTab,
  tabHref,
  type ReservationTab,
} from './reservation-tabs';

export const metadata: Metadata = { title: '내 예약' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const EMPTY_TEXT: Record<ReservationTab, string> = {
  upcoming: '예정된 예약이 없어요',
  completed: '이용한 예약이 없어요',
  cancelled: '취소한 예약이 없어요',
};

// 내 예약 목록 (J12, C-501). 로그인 확인은 <Suspense> 안에서 한다(기술 가이드 2장). PC는 가운데 최대 768px.
// 예약 하나가 회색 배경 위 흰 카드 하나다(#359 2번, reservation-card.tsx)
export default function ReservationsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 flex-col md:mx-auto md:w-full md:max-w-3xl md:px-6 md:py-6">
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
  const [result, now] = await Promise.all([getMyReservations(tab), getRequestNow()]);

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
              '-mb-px border-b-2 px-3 py-2 text-sm max-md:py-2.5',
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
        <EmptyState
          title={EMPTY_TEXT[tab]}
          action={
            <Link href={CUSTOMER_HOME} className={buttonVariants({ className: 'max-md:h-10' })}>
              매물 보러 가기
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2 px-4 pt-3 pb-4 md:gap-3 md:px-0 md:pt-4">
          {result.data.map((item) => (
            <li key={item.reservationId}>
              <ReservationCard
                item={item}
                visitPending={isVisitPending(statusOfTab(tab), item.startAt, now)}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
