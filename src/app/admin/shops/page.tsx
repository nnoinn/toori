import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/state';
import { getDb } from '@/db';
import { formatKst } from '@/lib/time';
import { cn } from '@/lib/utils';
import { ensureAdminPage } from '@/server/auth';
import { SHOP_STATUS_LABELS } from '@/server/shops/status';

import { labelCategory } from './format';
import { REVIEW_FILTERS, type ReviewFilter, selectShopsForReview } from './queries';
import { StatusBadge } from './status-badge';

export const metadata: Metadata = { title: '입점 승인' };

type SearchParams = Promise<{ status?: string | string[] }>;

const FILTER_LABELS: Record<ReviewFilter, string> = {
  pending: SHOP_STATUS_LABELS.pending,
  rejected: SHOP_STATUS_LABELS.rejected,
  approved: SHOP_STATUS_LABELS.approved,
  all: '전체',
};

function toFilter(value: string | string[] | undefined): ReviewFilter {
  return REVIEW_FILTERS.find((filter) => filter === value) ?? 'pending';
}

// 입점 승인 목록 (A-101). 주소: /admin/shops?status=pending|rejected|approved|all(기본 승인 대기). PC 기준
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
  await ensureAdminPage();
  const filter = toFilter((await searchParams).status);
  const rows = await selectShopsForReview(getDb(), filter);

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="입점 상태" className="flex gap-2">
        {REVIEW_FILTERS.map((value) => (
          <Link
            key={value}
            href={value === 'pending' ? '/admin/shops' : `/admin/shops?status=${value}`}
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

      {rows.length === 0 ? (
        <EmptyState
          title={filter === 'pending' ? '승인을 기다리는 샵이 없어요' : '샵이 없어요'}
          className="rounded-xl bg-card"
        />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-3 font-medium">샵</th>
                <th className="px-4 py-3 font-medium">업종</th>
                <th className="px-4 py-3 font-medium">상호</th>
                <th className="px-4 py-3 font-medium">지역</th>
                <th className="px-4 py-3 font-medium">신청</th>
                <th className="px-4 py-3 font-medium">심사</th>
                <th className="px-4 py-3 font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.shopId} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/admin/shops/${row.shopId}`} className="hover:underline">
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{labelCategory(row.category)}</td>
                  <td className="px-4 py-3">{row.businessName}</td>
                  <td className="px-4 py-3">{row.sigungu}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatKst(row.appliedAt)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {row.reviewedAt ? formatKst(row.reviewedAt) : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
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
