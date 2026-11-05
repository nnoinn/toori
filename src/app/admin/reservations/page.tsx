import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/state';
import { getDb } from '@/db';
import {
  getSlotStatus,
  isSlotOnHold,
  SLOT_STATUS_LABELS,
} from '@/features/slot-status/slot-status';
import { formatWon } from '@/lib/format';
import { getRequestNow } from '@/lib/request-time';
import { firstParam, type SearchValue } from '@/lib/search-params';
import { formatKst } from '@/lib/time';
import { cn } from '@/lib/utils';
import { ensureAdminPage } from '@/server/auth';

import {
  labelReservation,
  LOOKUP_TABS,
  type LookupTab,
  lookupHref,
  RESERVATION_FILTER_LABELS,
  RESERVATION_FILTERS,
  SLOT_FILTERS,
  type SlotFilter,
  toLookupTab,
  toReservationFilter,
  toSearchQuery,
  toSlotFilter,
} from './format';
import { LOOKUP_LIST_LIMIT, selectReservations, selectSlots } from './queries';

export const metadata: Metadata = { title: '매물·예약' };

type SearchParams = Promise<{ tab?: SearchValue; status?: SearchValue; q?: SearchValue }>;

const TAB_LABELS: Record<LookupTab, string> = { reservations: '예약', slots: '매물' };
const SEARCH_HINTS: Record<LookupTab, string> = {
  reservations: '예약번호, 샵 이름, 고객 닉네임',
  slots: '샵 이름, 메뉴 이름',
};

const HEAD_CELL = 'px-4 py-3 font-medium';
const CELL = 'px-4 py-3';

const slotFilterLabel = (filter: SlotFilter) =>
  filter === 'all' ? '전체' : SLOT_STATUS_LABELS[filter];

// 매물·예약 조회 (A-103). 주소: /admin/reservations?tab=reservations|slots&status=...&q=검색어 (조회만)
export default function AdminReservationsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-xl font-bold">매물·예약</h1>
      <Suspense fallback={<ListSkeleton />}>
        <Lookup searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Lookup({ searchParams }: { searchParams: SearchParams }) {
  await ensureAdminPage();
  const params = await searchParams;
  const tab = toLookupTab(firstParam(params.tab));
  const status = firstParam(params.status);
  const query = toSearchQuery(firstParam(params.q));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="조회 종류" className="flex gap-2">
          {LOOKUP_TABS.map((value) => (
            <Link
              key={value}
              href={lookupHref({ tab: value })}
              aria-current={value === tab ? 'page' : undefined}
              className={chipClass(value === tab)}
            >
              {TAB_LABELS[value]}
            </Link>
          ))}
        </nav>
        <form action="/admin/reservations" className="flex w-full max-w-md gap-2">
          <input type="hidden" name="tab" value={tab} />
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <Input
            name="q"
            defaultValue={query}
            maxLength={50}
            placeholder={SEARCH_HINTS[tab]}
            aria-label="매물·예약 검색"
          />
          <Button type="submit" variant="outline">
            검색
          </Button>
        </form>
      </div>
      {tab === 'reservations' ? (
        <ReservationList status={status} query={query} />
      ) : (
        <SlotList status={status} query={query} />
      )}
    </div>
  );
}

function chipClass(active: boolean) {
  return cn(
    'rounded-full px-3 py-1 text-sm ring-1 ring-foreground/10',
    active ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
  );
}

async function ReservationList({ status, query }: { status: string | undefined; query: string }) {
  const filter = toReservationFilter(status);
  const { rows, hasMore } = await selectReservations(getDb(), { filter, query });
  return (
    <>
      <nav aria-label="예약 상태" className="flex flex-wrap gap-2">
        {RESERVATION_FILTERS.map((value) => (
          <Link
            key={value}
            href={lookupHref({ tab: 'reservations', status: value, query })}
            aria-current={value === filter ? 'page' : undefined}
            className={chipClass(value === filter)}
          >
            {RESERVATION_FILTER_LABELS[value]}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState title="맞는 예약이 없어요" className="rounded-xl bg-card" />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className={HEAD_CELL}>예약번호</th>
                <th className={HEAD_CELL}>샵</th>
                <th className={HEAD_CELL}>메뉴</th>
                <th className={HEAD_CELL}>고객</th>
                <th className={HEAD_CELL}>일시</th>
                <th className={HEAD_CELL}>결제액</th>
                <th className={HEAD_CELL}>상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.reservationId} className="border-b last:border-0 hover:bg-muted/50">
                  <td className={cn(CELL, 'font-medium whitespace-nowrap')}>
                    <Link
                      href={`/admin/reservations/${row.reservationId}`}
                      className="hover:underline"
                    >
                      {row.code}
                    </Link>
                  </td>
                  <td className={CELL}>{row.shopName}</td>
                  <td className={CELL}>{row.menuName}</td>
                  <td className={CELL}>{row.customerNickname}</td>
                  <td className={cn(CELL, 'whitespace-nowrap')}>{formatKst(row.startAt)}</td>
                  <td className={cn(CELL, 'whitespace-nowrap')}>{formatWon(row.amount)}</td>
                  <td className={CELL}>
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary">
                        {labelReservation(row.status, row.visitResult)}
                      </Badge>
                      {row.needsReview ? <Badge variant="destructive">확인 필요</Badge> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <MoreNotice hasMore={hasMore} />
    </>
  );
}

async function SlotList({ status, query }: { status: string | undefined; query: string }) {
  const filter = toSlotFilter(status);
  const now = await getRequestNow();
  const { rows, hasMore } = await selectSlots(getDb(), { filter, query, now });
  return (
    <>
      <nav aria-label="매물 상태" className="flex flex-wrap gap-2">
        {SLOT_FILTERS.map((value) => (
          <Link
            key={value}
            href={lookupHref({ tab: 'slots', status: value, query })}
            aria-current={value === filter ? 'page' : undefined}
            className={chipClass(value === filter)}
          >
            {slotFilterLabel(value)}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState title="맞는 매물이 없어요" className="rounded-xl bg-card" />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className={HEAD_CELL}>샵</th>
                <th className={HEAD_CELL}>메뉴</th>
                <th className={HEAD_CELL}>일시</th>
                <th className={HEAD_CELL}>정가</th>
                <th className={HEAD_CELL}>할인</th>
                <th className={HEAD_CELL}>판매가</th>
                <th className={HEAD_CELL}>상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.slotId} className="border-b last:border-0 hover:bg-muted/50">
                  <td className={cn(CELL, 'font-medium')}>
                    <Link href={`/admin/shops/${row.shopId}`} className="hover:underline">
                      {row.shopName}
                    </Link>
                  </td>
                  <td className={CELL}>
                    {row.menuName}
                    {row.newCustomerOnly ? (
                      <span className="ml-1 text-xs text-muted-foreground">신규 고객 전용</span>
                    ) : null}
                  </td>
                  <td className={cn(CELL, 'whitespace-nowrap')}>{formatKst(row.startAt)}</td>
                  <td className={cn(CELL, 'whitespace-nowrap')}>{formatWon(row.listPrice)}</td>
                  <td className={CELL}>{row.discountRate}%</td>
                  <td className={cn(CELL, 'whitespace-nowrap')}>{formatWon(row.salePrice)}</td>
                  <td className={CELL}>
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary">
                        {SLOT_STATUS_LABELS[getSlotStatus(row, now)]}
                      </Badge>
                      {isSlotOnHold(row, now) ? <Badge>결제 중</Badge> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <MoreNotice hasMore={hasMore} />
    </>
  );
}

function MoreNotice({ hasMore }: { hasMore: boolean }) {
  if (!hasMore) return null;
  return (
    <p className="text-sm text-muted-foreground">
      {LOOKUP_LIST_LIMIT}건까지만 보여 드려요. 상태나 검색으로 좁혀 주세요.
    </p>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="불러오는 중">
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
