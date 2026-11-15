import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DetailLink, SelectableRow, SelectableRows } from '@/components/ui/selectable-rows';
import { Skeleton } from '@/components/ui/skeleton';
import { SortSelect } from '@/components/ui/sort-select';
import { EmptyState } from '@/components/ui/state';
import { getDb } from '@/db';
import { formatWon } from '@/lib/format';
import { firstParam, type SearchValue } from '@/lib/search-params';
import { cn } from '@/lib/utils';
import { recordAdminAccess } from '@/server/admin/access-log';
import { ensureAdminPage } from '@/server/auth';

import { ADMIN_LIST_LIMIT, toSearchQuery } from '../lookup';
import {
  defaultSettlementSort,
  SETTLEMENT_FILTER_LABELS,
  SETTLEMENT_FILTERS,
  SETTLEMENT_SORT_LABELS,
  SETTLEMENT_SORTS,
  settlementsHref,
  toPayoutDate,
  toSettlementFilter,
  toSettlementSort,
} from './format';
import {
  countOpenDisputes,
  type OutstandingPenaltyRow,
  selectOutstandingPenalties,
  selectSettlements,
} from './queries';
import { StatusBadge } from './status-badge';

export const metadata: Metadata = { title: '정산' };

type SearchParams = Promise<{
  status?: SearchValue;
  sort?: SearchValue;
  q?: SearchValue;
  from?: SearchValue;
  to?: SearchValue;
}>;

const HEAD_CELL = 'px-4 py-3 font-medium';
const CELL = 'px-4 py-3';

// 운영자 정산 관리 (A-105, W20 ④). 주소: /admin/settlements?status=pending|requested|paid|failed|all&sort=&q=샵 이름&from=&to=(지급일)
// 목요일 묶기(W20 ③)가 만든 정산 묶음(샵 하나 × 지급일 하나)을 본다. 줄을 한 번 누르면 선택, 두 번 누르거나 Enter·[상세]로
// 정산서 한 장이 열린다(#360 1번). 지급 요청은 PG 지급대행 계약 뒤에 연다(투리는 돈을 직접 보내지 않는다, X-206)
export default function AdminSettlementsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">정산</h1>
        <p className="text-sm text-muted-foreground">
          매주 목요일(공휴일이면 다음 영업일) 새벽에 샵마다 정산서가 한 장씩 만들어져요. 지급 요청은
          PG 지급대행 계약 뒤에 열려요.
        </p>
      </div>
      <Suspense fallback={<ListSkeleton />}>
        <Overview searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Overview({ searchParams }: { searchParams: SearchParams }) {
  const admin = await ensureAdminPage();
  const params = await searchParams;
  const filter = toSettlementFilter(firstParam(params.status));
  const chosenSort = toSettlementSort(firstParam(params.sort));
  const sort = chosenSort ?? defaultSettlementSort(filter);
  const query = toSearchQuery(firstParam(params.q));
  const from = toPayoutDate(firstParam(params.from));
  const to = toPayoutDate(firstParam(params.to));
  await recordAdminAccess(admin.userId, {
    action: 'search',
    targetType: 'list',
    path: settlementsHref({ filter, sort: chosenSort, from, to }),
    query,
  });
  const db = getDb();
  const [{ rows, hasMore }, penalties, openDisputes] = await Promise.all([
    selectSettlements(db, { filter, sort, query, from, to }),
    selectOutstandingPenalties(db),
    countOpenDisputes(db),
  ]);
  const keep = { query, from, to };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <OutstandingPenalties rows={penalties} />
        <Card>
          <CardHeader>
            <CardTitle>정산 보류</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p>
              확인 중인 이의제기 <span className="font-medium">{openDisputes}건</span>. 그 거래는
              결론을 기록할 때까지 정산서에 들어가지 않아요.
            </p>
            <Link href="/admin/disputes" className="w-fit text-primary hover:underline">
              이의제기 보기
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="정산 상태" className="flex gap-2">
          {SETTLEMENT_FILTERS.map((value) => (
            <Link
              key={value}
              href={settlementsHref({ filter: value, sort: chosenSort, ...keep })}
              aria-current={value === filter ? 'page' : undefined}
              className={chipClass(value === filter)}
            >
              {SETTLEMENT_FILTER_LABELS[value]}
            </Link>
          ))}
        </nav>
        <SortSelect
          value={sort}
          options={SETTLEMENT_SORTS.map((value) => ({
            value,
            label: SETTLEMENT_SORT_LABELS[value],
            href: settlementsHref({ filter, sort: value, ...keep }),
          }))}
        />
      </div>

      <form action="/admin/settlements" className="flex flex-wrap items-end gap-2">
        {filter !== 'pending' ? <input type="hidden" name="status" value={filter} /> : null}
        {chosenSort ? <input type="hidden" name="sort" value={chosenSort} /> : null}
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">
          지급일부터
          <Input type="date" name="from" defaultValue={from ?? ''} className="w-40" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">
          지급일까지
          <Input type="date" name="to" defaultValue={to ?? ''} className="w-40" />
        </label>
        <Input
          name="q"
          defaultValue={query}
          maxLength={50}
          placeholder="샵 이름"
          aria-label="샵 이름으로 찾기"
          className="w-56"
        />
        <Button type="submit" variant="outline">
          검색
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title={filter === 'pending' ? '지급 전인 정산이 없어요' : '맞는 정산이 없어요'}
          description="결제 수수료율이 정해지기 전(PG 계약 전)에는 목요일에 정산서를 만들지 않아요."
          className="rounded-xl bg-card"
        />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
          <table className="w-full min-w-[72rem] text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className={HEAD_CELL}>지급일</th>
                <th className={HEAD_CELL}>샵</th>
                <th className={HEAD_CELL}>기간</th>
                <th className={cn(HEAD_CELL, 'text-right')}>건수</th>
                <th className={cn(HEAD_CELL, 'text-right')}>기준 금액</th>
                <th className={cn(HEAD_CELL, 'text-right')}>수수료</th>
                <th className={cn(HEAD_CELL, 'text-right')}>뗀 패널티</th>
                <th className={cn(HEAD_CELL, 'text-right')}>실지급액</th>
                <th className={HEAD_CELL}>상태</th>
                <th className={HEAD_CELL}>
                  <span className="sr-only">상세</span>
                </th>
              </tr>
            </thead>
            <SelectableRows>
              {rows.map((row) => {
                const href = `/admin/settlements/${row.settlementId}`;
                return (
                  <SelectableRow key={row.settlementId} id={row.settlementId} href={href}>
                    <td className={cn(CELL, 'whitespace-nowrap')}>{row.payoutDate}</td>
                    <td className={cn(CELL, 'font-medium')}>{row.shopName}</td>
                    <td className={cn(CELL, 'whitespace-nowrap text-muted-foreground')}>
                      {row.periodStart} ~ {row.payoutDate}
                    </td>
                    <td className={cn(CELL, 'text-right')}>{row.itemCount}</td>
                    <td className={cn(CELL, 'text-right whitespace-nowrap')}>
                      {formatWon(row.baseAmount)}
                    </td>
                    <td className={cn(CELL, 'text-right whitespace-nowrap')}>
                      {formatWon(row.feeAmount)}
                    </td>
                    <td className={cn(CELL, 'text-right whitespace-nowrap')}>
                      {formatWon(row.penaltyDeducted)}
                    </td>
                    <td className={cn(CELL, 'text-right font-medium whitespace-nowrap')}>
                      {formatWon(row.payoutAmount)}
                    </td>
                    <td className={CELL}>
                      <StatusBadge status={row.status} />
                    </td>
                    <td className={cn(CELL, 'text-right')}>
                      <DetailLink href={href} label={`${row.shopName} ${row.payoutDate} 정산서`} />
                    </td>
                  </SelectableRow>
                );
              })}
            </SelectableRows>
          </table>
        </div>
      )}
      {hasMore ? (
        <p className="text-sm text-muted-foreground">
          {ADMIN_LIST_LIMIT}건까지만 보여 드려요. 상태·지급일·샵 이름으로 좁혀 주세요.
        </p>
      ) : null}
    </div>
  );
}

/** 미수 패널티(원장님 귀책 취소 패널티 중 아직 다 걷지 못한 것). 다음 정산에서 떼고, 미수가 있어도 이용 제한은 없다 */
function OutstandingPenalties({ rows }: { rows: OutstandingPenaltyRow[] }) {
  const total = rows.reduce((sum, row) => sum + row.remaining, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>미수 패널티</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {rows.length === 0 ? (
          <p className="text-muted-foreground">아직 다 걷지 못한 패널티가 없어요.</p>
        ) : (
          <>
            <p>
              {rows.length}개 샵, 모두 <span className="font-medium">{formatWon(total)}</span>. 다음
              정산에서 오래된 것부터 떼요.
            </p>
            <ul className="flex flex-col gap-1">
              {rows.map((row) => (
                <li key={row.shopId} className="flex justify-between gap-3">
                  <Link href={`/admin/shops/${row.shopId}`} className="hover:underline">
                    {row.shopName}
                  </Link>
                  <span className="whitespace-nowrap text-muted-foreground">
                    {row.count}건 · {formatWon(row.remaining)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
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
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
