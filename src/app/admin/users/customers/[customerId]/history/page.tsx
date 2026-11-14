import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BackButton } from '@/components/ui/back-button';
import { LoadingCards } from '@/components/ui/state';
import { firstParam, type SearchValue } from '@/lib/search-params';
import { isUuid } from '@/lib/uuid';
import { ensureAdminPage } from '@/server/auth';

import { AdminHistoryList } from '../../../history-list';

export const metadata: Metadata = { title: '고객 이력' };

type Params = Promise<{ customerId: string }>;
type SearchParams = Promise<{ before?: SearchValue }>;

// 고객 계정 이력 (#374, AUTH-13). 주소: /admin/users/customers/[customerId]/history?before=… (조회만, 볼 때마다 열람 기록)
export default function AdminCustomerHistoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  return (
    <main className="flex w-full max-w-4xl flex-1 flex-col gap-4 p-6">
      <div className="flex items-center gap-2">
        <BackButton fallbackHref="/admin/users" />
        <h1 className="text-xl font-bold">고객 이력</h1>
      </div>
      <Suspense fallback={<LoadingCards count={1} />}>
        <History params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function History({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  await ensureAdminPage();
  const { customerId } = await params;
  if (!isUuid(customerId)) notFound();
  return (
    <AdminHistoryList
      accountType="customer"
      accountId={customerId}
      before={firstParam((await searchParams).before)}
      path={`/admin/users/customers/${customerId}/history`}
    />
  );
}
