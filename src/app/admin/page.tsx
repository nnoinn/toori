import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getDb } from '@/db';
import { formatWon } from '@/lib/format';
import { getRequestNow } from '@/lib/request-time';
import { formatKstDateTime } from '@/lib/time';
import { ensureAdminPage } from '@/server/auth';

import { selectOpenDisputeSummary } from './disputes/queries';
import { countPaymentIssues } from './payment-issues/queries';
import { countActiveHolds } from './settlements/hold-queries';
import { selectOutstandingPenalties } from './settlements/queries';
import { countPendingShops, selectPublishPausedShops } from './shops/queries';

export const metadata: Metadata = { title: '운영자' };

/** 게시 멈춘 샵 카드에 이름을 보여 줄 샵 수. 나머지는 "외 N곳"으로 */
const PAUSED_SHOPS_SHOWN = 3;

// 운영자 첫 화면. 날마다 확인할 일을 카드로 모아 보고, 누르면 그 화면으로 간다(11/20).
// 입점 승인(A-101) 대기, 결제·환불 확인(#373 ①), 확인 중인 이의제기(A-104), 정산 보류(#373 ②), 미수 패널티(A-105),
// 게시 멈춘 샵(#373 ④). 예약 작업 경고와 알림 확인은 모든 운영자 화면 위쪽에 따로 뜬다.
// 고객 정보는 읽지 않아서 열람 기록은 남기지 않는다. 관리자가 아니면 404(<Suspense> 안에서 확인). PC 기준
export default function AdminHomePage() {
  return (
    <main className="flex flex-1 flex-col gap-4 p-6">
      <h1 className="text-xl font-bold">운영자 화면</h1>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Suspense fallback={<CardSkeleton />}>
          <PendingShopsCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <PaymentIssuesCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <OpenDisputesCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <SettlementHoldsCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <OutstandingPenaltiesCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <PublishPausedShopsCard />
        </Suspense>
      </div>
    </main>
  );
}

async function PendingShopsCard() {
  await ensureAdminPage();
  const pending = await countPendingShops(getDb());
  return (
    <LinkCard
      href="/admin/shops"
      title="입점 승인"
      description="사업자 정보를 확인하고 승인하거나 반려해요"
    >
      <p className="text-2xl font-bold">
        승인 대기 <span className="text-primary">{pending}</span>곳
      </p>
    </LinkCard>
  );
}

async function PaymentIssuesCard() {
  await ensureAdminPage();
  const issues = await countPaymentIssues(getDb(), await getRequestNow());
  return (
    <LinkCard
      href="/admin/payment-issues"
      title="결제·환불 확인"
      description="정리 작업이 고치지 못한 결제·환불을 다시 시도해요"
    >
      <p className="text-2xl font-bold">
        확인할 건 <span className={issues > 0 ? 'text-destructive' : 'text-primary'}>{issues}</span>
        건
      </p>
    </LinkCard>
  );
}

async function OpenDisputesCard() {
  await ensureAdminPage();
  const { count, oldestReceivedAt } = await selectOpenDisputeSummary(getDb());
  return (
    <LinkCard
      href="/admin/disputes"
      title="이의제기"
      description="결론이 날 때까지 그 거래는 정산하지 않아요"
    >
      <p className="text-2xl font-bold">
        확인 중 <span className={count > 0 ? 'text-destructive' : 'text-primary'}>{count}</span>건
      </p>
      {oldestReceivedAt ? (
        <p className="mt-1 text-sm text-muted-foreground">
          가장 오래된 접수 {formatKstDateTime(oldestReceivedAt)}
        </p>
      ) : null}
    </LinkCard>
  );
}

async function SettlementHoldsCard() {
  await ensureAdminPage();
  const holds = await countActiveHolds(getDb());
  return (
    <LinkCard
      href="/admin/settlements"
      title="정산 보류"
      description="풀 때까지 목요일 정산에 묶지 않아요"
    >
      <p className="text-2xl font-bold">
        거래 <span className="text-primary">{holds.reservations}</span>건 · 샵 전체{' '}
        <span className="text-primary">{holds.shops}</span>곳
      </p>
    </LinkCard>
  );
}

async function OutstandingPenaltiesCard() {
  await ensureAdminPage();
  const rows = await selectOutstandingPenalties(getDb());
  const total = rows.reduce((sum, row) => sum + row.remaining, 0);
  return (
    <LinkCard
      href="/admin/settlements"
      title="미수 패널티"
      description="다음 정산에서 떼는 원장님 패널티예요"
    >
      <p className="text-2xl font-bold">
        샵 <span className="text-primary">{rows.length}</span>곳
      </p>
      {rows.length > 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">모두 {formatWon(total)}</p>
      ) : null}
    </LinkCard>
  );
}

// 게시 멈춘 샵은 모아 보는 화면이 없어서 카드 안에 샵 이름을 바로 보여 주고(누르면 샵 상세), 카드 전체는 링크로 감싸지 않는다
async function PublishPausedShopsCard() {
  await ensureAdminPage();
  const { total, shops } = await selectPublishPausedShops(getDb(), PAUSED_SHOPS_SHOWN);
  const more = total - shops.length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>게시 멈춘 샵</CardTitle>
        <CardDescription>샵 상세에서 게시를 다시 열 수 있어요</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">
          <span className="text-primary">{total}</span>곳
        </p>
        {shops.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {shops.map((shop) => (
              <li key={shop.shopId} className="flex justify-between gap-3">
                <Link href={`/admin/shops/${shop.shopId}`} className="truncate hover:underline">
                  {shop.name}
                </Link>
                <span className="whitespace-nowrap text-muted-foreground">
                  {formatKstDateTime(shop.pausedAt)}부터
                </span>
              </li>
            ))}
            {more > 0 ? <li className="text-muted-foreground">외 {more}곳</li> : null}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

function LinkCard({
  href,
  title,
  description,
  children,
}: {
  href: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href}>
      <Card className="h-full transition-colors hover:bg-muted/50">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </Link>
  );
}

function CardSkeleton() {
  return <Skeleton className="h-36 w-full rounded-xl" />;
}
