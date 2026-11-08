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
import { formatKst } from '@/lib/time';
import { cn } from '@/lib/utils';
import { ensureAdminPage } from '@/server/auth';

import { StatusBadge } from '../shops/status-badge';
import { maskPhone, toSearchQuery, toUserTab, USER_TABS, type UserTab } from './format';
import { type ListResult, selectCustomers, selectOwners, USER_LIST_LIMIT } from './queries';

export const metadata: Metadata = { title: '회원' };

type SearchParams = Promise<{ tab?: SearchValue; q?: SearchValue }>;

const TAB_LABELS: Record<UserTab, string> = { customers: '고객', owners: '원장님' };
const SEARCH_HINTS: Record<UserTab, string> = {
  customers: '닉네임, 이메일, 휴대폰 전체 번호',
  owners: '이름, 샵 이름, 이메일, 휴대폰 전체 번호',
};

const HEAD_CELL = 'px-4 py-3 font-medium';
const CELL = 'px-4 py-3';

// 회원 조회 (A-102). 주소: /admin/users?tab=customers|owners&q=검색어. 고객 계정과 원장님 계정을 나눠서 보여준다(조회만)
export default function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-xl font-bold">회원</h1>
      <Suspense fallback={<ListSkeleton />}>
        <UserList searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function UserList({ searchParams }: { searchParams: SearchParams }) {
  await ensureAdminPage();
  const params = await searchParams;
  const tab = toUserTab(firstParam(params.tab));
  const query = toSearchQuery(firstParam(params.q));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="계정 종류" className="flex gap-2">
          {USER_TABS.map((value) => (
            <Link
              key={value}
              href={`/admin/users?tab=${value}`}
              aria-current={value === tab ? 'page' : undefined}
              className={cn(
                'rounded-full px-3 py-1 text-sm ring-1 ring-foreground/10',
                value === tab ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
              )}
            >
              {TAB_LABELS[value]}
            </Link>
          ))}
        </nav>
        <form action="/admin/users" className="flex w-full max-w-md gap-2">
          <input type="hidden" name="tab" value={tab} />
          <Input
            name="q"
            defaultValue={query}
            maxLength={50}
            placeholder={SEARCH_HINTS[tab]}
            aria-label="회원 검색"
          />
          <Button type="submit" variant="outline">
            검색
          </Button>
        </form>
      </div>
      {tab === 'customers' ? <CustomerList query={query} /> : <OwnerList query={query} />}
    </div>
  );
}

async function CustomerList({ query }: { query: string }) {
  const result = await selectCustomers(getDb(), query);
  if (result.rows.length === 0) return <NoUsers query={query} label="고객" />;
  return (
    <UserTable result={result} minWidth="min-w-[52rem]">
      <thead className="text-left text-muted-foreground">
        <tr className="border-b">
          <th className={HEAD_CELL}>닉네임</th>
          <th className={HEAD_CELL}>휴대폰</th>
          <th className={HEAD_CELL}>가입</th>
          <th className={HEAD_CELL}>예약</th>
          <th className={HEAD_CELL}>취소</th>
          <th className={HEAD_CELL}>노쇼</th>
          <th className={HEAD_CELL}>상태</th>
        </tr>
      </thead>
      <tbody>
        {result.rows.map((row) => (
          <tr key={row.customerId} className="border-b last:border-0 hover:bg-muted/50">
            <td className={cn(CELL, 'font-medium')}>
              <Link href={`/admin/users/customers/${row.customerId}`} className="hover:underline">
                {row.nickname}
              </Link>
            </td>
            <td className={cn(CELL, 'whitespace-nowrap')}>{maskPhone(row.phone)}</td>
            <td className={cn(CELL, 'whitespace-nowrap')}>{formatKst(row.createdAt)}</td>
            <td className={CELL}>{row.reservationCount}</td>
            <td className={CELL}>{row.cancelCount}</td>
            <td className={cn(CELL, row.noShowCount > 0 && 'font-medium text-destructive')}>
              {row.noShowCount}
            </td>
            <td className={CELL}>
              <AccountBadge withdrawnAt={row.withdrawnAt} />
            </td>
          </tr>
        ))}
      </tbody>
    </UserTable>
  );
}

async function OwnerList({ query }: { query: string }) {
  const result = await selectOwners(getDb(), query);
  if (result.rows.length === 0) return <NoUsers query={query} label="원장님" />;
  return (
    <UserTable result={result} minWidth="min-w-[52rem]">
      <thead className="text-left text-muted-foreground">
        <tr className="border-b">
          <th className={HEAD_CELL}>이름</th>
          <th className={HEAD_CELL}>샵</th>
          <th className={HEAD_CELL}>입점</th>
          <th className={HEAD_CELL}>휴대폰</th>
          <th className={HEAD_CELL}>매물</th>
          <th className={HEAD_CELL}>가입</th>
          <th className={HEAD_CELL}>상태</th>
        </tr>
      </thead>
      <tbody>
        {result.rows.map((row) => (
          <tr key={row.ownerId} className="border-b last:border-0 hover:bg-muted/50">
            <td className={cn(CELL, 'font-medium')}>{row.name}</td>
            <td className={CELL}>
              {row.shopId ? (
                <Link href={`/admin/shops/${row.shopId}`} className="hover:underline">
                  {row.shopName}
                </Link>
              ) : (
                '-'
              )}
            </td>
            <td className={CELL}>
              {row.shopStatus ? <StatusBadge status={row.shopStatus} /> : '-'}
            </td>
            <td className={cn(CELL, 'whitespace-nowrap')}>{maskPhone(row.phone)}</td>
            <td className={CELL}>{row.slotCount}</td>
            <td className={cn(CELL, 'whitespace-nowrap')}>{formatKst(row.createdAt)}</td>
            <td className={CELL}>
              <AccountBadge withdrawnAt={row.withdrawnAt} />
            </td>
          </tr>
        ))}
      </tbody>
    </UserTable>
  );
}

function UserTable<Row>({
  result,
  minWidth,
  children,
}: {
  result: ListResult<Row>;
  minWidth: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
        <table className={cn('w-full text-sm', minWidth)}>{children}</table>
      </div>
      {result.hasMore ? (
        <p className="text-sm text-muted-foreground">
          {USER_LIST_LIMIT}명까지만 보여 드려요. 검색으로 좁혀 주세요.
        </p>
      ) : null}
    </>
  );
}

function NoUsers({ query, label }: { query: string; label: string }) {
  return (
    <EmptyState
      title={query ? `'${query}'에 맞는 ${label}이 없어요` : `${label}이 없어요`}
      className="rounded-xl bg-card"
    />
  );
}

function AccountBadge({ withdrawnAt }: { withdrawnAt: Date | null }) {
  return withdrawnAt ? (
    <Badge variant="destructive">탈퇴</Badge>
  ) : (
    <Badge variant="secondary">이용 중</Badge>
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
