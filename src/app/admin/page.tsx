import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getDb } from '@/db';
import { ensureAdminPage } from '@/server/auth';

import { countPendingShops } from './shops/queries';

export const metadata: Metadata = { title: '운영자' };

// 운영자 첫 화면. 지금은 입점 승인(A-101) 대기 수만 보여준다. 관리자가 아니면 404(<Suspense> 안에서 확인). PC 기준
export default function AdminHomePage() {
  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-xl font-bold">운영자 화면</h1>
      <Suspense fallback={<Skeleton className="h-28 w-full max-w-sm rounded-xl" />}>
        <PendingShopsCard />
      </Suspense>
    </main>
  );
}

async function PendingShopsCard() {
  await ensureAdminPage();
  const pending = await countPendingShops(getDb());
  return (
    <Link href="/admin/shops" className="max-w-sm">
      <Card className="transition-colors hover:bg-muted/50">
        <CardHeader>
          <CardTitle>입점 승인</CardTitle>
          <CardDescription>사업자 정보를 확인하고 승인하거나 반려해요</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">
            승인 대기 <span className="text-primary">{pending}</span>곳
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
