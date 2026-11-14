import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { DetailLink, SelectableRow, SelectableRows } from '@/components/ui/selectable-rows';
import { Skeleton } from '@/components/ui/skeleton';
import { SortSelect } from '@/components/ui/sort-select';
import { EmptyState } from '@/components/ui/state';
import { getDb } from '@/db';
import { firstParam } from '@/lib/search-params';
import { formatKstDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { recordAdminAccess } from '@/server/admin/access-log';
import { ensureAdminPage } from '@/server/auth';
import { SHOP_STATUS_LABELS } from '@/server/shops/status';

import { categoryLabel } from '@/server/policy';
import { defaultShopSort, SHOP_SORT_LABELS, SHOP_SORTS, shopsHref, toShopSort } from './format';
import { REVIEW_FILTERS, type ReviewFilter, selectShopsForReview } from './queries';
import { StatusBadge } from './status-badge';

export const metadata: Metadata = { title: '입점 승인' };

type SearchParams = Promise<{ status?: string | string[]; sort?: string | string[] }>;

const HEAD_CELL = 'px-4 py-3 font-medium';
const CELL = 'px-4 py-3';

const FILTER_LABELS: Record<ReviewFilter, string> = {
  pending: SHOP_STATUS_LABELS.pending,
  rejected: SHOP_STATUS_LABELS.rejected,
  approved: SHOP_STATUS_LABELS.approved,
  all: '전체',
};

function toFilter(value: string | string[] | undefined): ReviewFilter {
  return REVIEW_FILTERS.find((filter) => filter === value) ?? 'pending';
}

// 입점 승인 목록 (A-101). 주소: /admin/shops?status=pending|rejected|approved|all(기본 승인 대기)&sort=... PC 기준
// 줄을 한 번 누르면 선택, 두 번 누르거나 Enter·[상세]로 심사 화면이 열리고, 오른쪽 위에서 정렬을 고른다(#360 1번)
export default function AdminShopsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-xl font-bold">입점 승인</h1>
      <Suspense fallback={<ListSkeleton />}>
        <ShopList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ShopList({ searchParams }: { searchParams: SearchParams }) {
  const admin = await ensureAdminPage();
  const params = await searchParams;
  const filter = toFilter(params.status);
  // 주소에 고른 정렬이 있으면 다른 거르기로 옮겨도 그 정렬을 지키고, 없으면 거르기마다 기본 정렬
  const chosenSort = toShopSort(firstParam(params.sort));
  const sort = chosenSort ?? defaultShopSort(filter);
  await recordAdminAccess(admin.userId, {
    action: 'search',
    targetType: 'list',
    path: `/admin/shops?status=${filter}`,
  });
  const rows = await selectShopsForReview(getDb(), filter, sort);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="입점 상태" className="flex gap-2">
          {REVIEW_FILTERS.map((value) => (
            <Link
              key={value}
              href={shopsHref({ filter: value, sort: chosenSort })}
              aria-current={value === filter ? 'page' : undefined}
              className={cn(
                'rounded-full px-3 py-1 text-sm ring-1 ring-foreground/10',
                value === filter ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
              )}
            >
              {FILTER_LABELS[value]}
            </Link>
          ))}
        </nav>
        <SortSelect
          value={sort}
          options={SHOP_SORTS.map((value) => ({
            value,
            label: SHOP_SORT_LABELS[value],
            href: shopsHref({ filter, sort: value }),
          }))}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={filter === 'pending' ? '승인을 기다리는 샵이 없어요' : '샵이 없어요'}
          className="rounded-xl bg-card"
        />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className={HEAD_CELL}>신청 시각</th>
                <th className={HEAD_CELL}>샵</th>
                <th className={HEAD_CELL}>업종</th>
                <th className={HEAD_CELL}>상호</th>
                <th className={HEAD_CELL}>지역</th>
                <th className={HEAD_CELL}>심사 시각</th>
                <th className={HEAD_CELL}>상태</th>
                <th className={HEAD_CELL}>
                  <span className="sr-only">상세</span>
                </th>
              </tr>
            </thead>
            <SelectableRows>
              {rows.map((row) => {
                const href = `/admin/shops/${row.shopId}`;
                return (
                  <SelectableRow key={row.shopId} id={row.shopId} href={href}>
                    <td className={cn(CELL, 'whitespace-nowrap')}>
                      {formatKstDateTime(row.appliedAt)}
                    </td>
                    <td className={cn(CELL, 'font-medium')}>{row.name}</td>
                    <td className={CELL}>{categoryLabel(row.category)}</td>
                    <td className={CELL}>{row.businessName}</td>
                    <td className={CELL}>{row.sigungu}</td>
                    <td className={cn(CELL, 'whitespace-nowrap')}>
                      {row.reviewedAt ? formatKstDateTime(row.reviewedAt) : '-'}
                    </td>
                    <td className={CELL}>
                      <StatusBadge status={row.status} />
                    </td>
                    <td className={cn(CELL, 'text-right')}>
                      <DetailLink href={href} label={`${row.name} 심사 화면`} />
                    </td>
                  </SelectableRow>
                );
              })}
            </SelectableRows>
          </table>
        </div>
      )}
    </div>
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
