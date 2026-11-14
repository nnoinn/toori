import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BackButton } from '@/components/ui/back-button';
import { LoadingCards } from '@/components/ui/state';
import { firstParam, type SearchValue } from '@/lib/search-params';
import { isUuid } from '@/lib/uuid';
import { ensureAdminPage } from '@/server/auth';

import { AdminHistoryList } from '../../../history-list';

export const metadata: Metadata = { title: '원장님 이력' };

type Params = Promise<{ ownerId: string }>;
type SearchParams = Promise<{ before?: SearchValue }>;

// 원장님 계정 이력 (#374, AUTH-13). 주소: /admin/users/owners/[ownerId]/history?before=… (조회만, 볼 때마다 열람 기록)
// 입점 심사 상세의 [원장님 이력 보기]에서 들어온다. 원장님 내 계정의 계정 이력(정민석)과 같은 함수·문구를 쓴다
export default function AdminOwnerHistoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  return (
    <main className="flex w-full max-w-4xl flex-1 flex-col gap-4 p-6">
      <div className="flex items-center gap-2">
        <BackButton fallbackHref="/admin/shops" />
        <h1 className="text-xl font-bold">원장님 이력</h1>
      </div>
      <Suspense fallback={<LoadingCards count={1} />}>
        <History params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function History({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  await ensureAdminPage();
  const { ownerId } = await params;
  if (!isUuid(ownerId)) notFound();
  return (
    <AdminHistoryList
      accountType="owner"
      accountId={ownerId}
      before={firstParam((await searchParams).before)}
      path={`/admin/users/owners/${ownerId}/history`}
    />
  );
}
