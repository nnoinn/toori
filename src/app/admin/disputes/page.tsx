import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/state';
import { getDb } from '@/db';
import { firstParam, type SearchValue } from '@/lib/search-params';
import { formatKstDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { recordAdminAccess } from '@/server/admin/access-log';
import { ensureAdminPage } from '@/server/auth';

import { ADMIN_LIST_LIMIT, toSearchQuery } from '../lookup';
import {
  DISPUTE_CHANNEL_LABELS,
  DISPUTE_FILTER_LABELS,
  DISPUTE_FILTERS,
  DISPUTE_SORT_LABELS,
  DISPUTE_TYPE_LABELS,
  disputesHref,
  labelDisputeStatus,
  toDisputeFilter,
} from './format';
import { selectDisputes } from './queries';

export const metadata: Metadata = { title: '이의제기' };

type SearchParams = Promise<{ status?: SearchValue; q?: SearchValue }>;

const HEAD_CELL = 'px-4 py-3 font-medium';
const CELL = 'px-4 py-3';

// 이의제기 목록 (A-104, W19 ②). 주소: /admin/disputes?status=open|resolved|all&q=검색어.
// 확인 중(open)인 이의제기가 있는 거래는 정산이 보류된다(#350). 카카오톡 채널 건은 예약 상세의 [이의제기 등록]에서 등록한다
export default function AdminDisputesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">이의제기</h1>
        <p className="text-sm text-muted-foreground">
          확인 중인 이의제기가 있는 거래는 결론을 기록할 때까지 정산이 보류돼요. 카카오톡 채널로
          받은 건은 매물·예약에서 예약을 찾아 [이의제기 등록]으로 남겨 주세요.
        </p>
      </div>
      <Suspense fallback={<ListSkeleton />}>
        <List searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function List({ searchParams }: { searchParams: SearchParams }) {
  const admin = await ensureAdminPage();
  const params = await searchParams;
  const filter = toDisputeFilter(firstParam(params.status));
  const query = toSearchQuery(firstParam(params.q));
  await recordAdminAccess(admin.userId, {
    action: 'search',
    targetType: 'list',
    path: disputesHref({ filter }),
    query,
  });
  const { rows, hasMore } = await selectDisputes(getDb(), { filter, query });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="이의제기 상태" className="flex gap-2">
          {DISPUTE_FILTERS.map((value) => (
            <Link
              key={value}
              href={disputesHref({ filter: value, query })}
              aria-current={value === filter ? 'page' : undefined}
              className={chipClass(value === filter)}
            >
              {DISPUTE_FILTER_LABELS[value]}
            </Link>
          ))}
        </nav>
        <form action="/admin/disputes" className="flex w-full max-w-md gap-2">
          {filter !== 'open' ? <input type="hidden" name="status" value={filter} /> : null}
          <Input
            name="q"
            defaultValue={query}
            maxLength={50}
            placeholder="예약번호, 샵 이름, 손님"
            aria-label="이의제기 검색"
          />
          <Button type="submit" variant="outline">
            검색
          </Button>
        </form>
      </div>
      <p className="text-sm text-muted-foreground">정렬: {DISPUTE_SORT_LABELS[filter]}</p>
      {rows.length === 0 ? (
        <EmptyState
          title={filter === 'open' ? '확인 중인 이의제기가 없어요' : '맞는 이의제기가 없어요'}
          className="rounded-xl bg-card"
        />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
          <table className="w-full min-w-[64rem] text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className={HEAD_CELL}>받은 시각</th>
                <th className={HEAD_CELL}>예약번호</th>
                <th className={HEAD_CELL}>샵</th>
                <th className={HEAD_CELL}>손님</th>
                <th className={HEAD_CELL}>종류</th>
                <th className={HEAD_CELL}>경로</th>
                <th className={HEAD_CELL}>상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.disputeId} className="border-b last:border-0 hover:bg-muted/50">
                  <td className={cn(CELL, 'whitespace-nowrap')}>
                    {formatKstDateTime(row.receivedAt)}
                  </td>
                  <td className={cn(CELL, 'font-medium whitespace-nowrap')}>
                    <Link href={`/admin/disputes/${row.disputeId}`} className="hover:underline">
                      {row.reservationCode}
                    </Link>
                  </td>
                  <td className={CELL}>{row.shopName}</td>
                  {/* 손님 이름(#375)이 들어오면 이름으로 바꾼다. 지금은 닉네임 */}
                  <td className={CELL}>{row.customerNickname}</td>
                  <td className={CELL}>{DISPUTE_TYPE_LABELS[row.type]}</td>
                  <td className={CELL}>{DISPUTE_CHANNEL_LABELS[row.channel]}</td>
                  <td className={CELL}>
                    <Badge variant={row.status === 'open' ? 'default' : 'secondary'}>
                      {labelDisputeStatus(row.status, row.outcome)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hasMore ? (
        <p className="text-sm text-muted-foreground">
          {ADMIN_LIST_LIMIT}건까지만 보여 드려요. 상태나 검색으로 좁혀 주세요.
        </p>
      ) : null}
    </div>
  );
}

function chipClass(active: boolean) {
  return cn(
    'rounded-full px-3 py-1 text-sm ring-1 ring-foreground/10',
    active ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
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
