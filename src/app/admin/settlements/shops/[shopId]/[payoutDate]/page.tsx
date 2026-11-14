import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { BackButton } from '@/components/ui/back-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { isUuid } from '@/lib/uuid';
import { recordAdminAccess } from '@/server/admin/access-log';
import { ensureAdminPage } from '@/server/auth';
import { PAYMENT_FEE_RATE } from '@/server/policy';
import { readShopSettlementRows } from '@/server/settlements/settlement-store';
import { toSettlementItemViews } from '@/server/settlements/settlement-view';
import {
  readLastPayoutDate,
  readPayoutAccount,
  readShopSettlements,
  readUnpaidPenalties,
} from '@/server/settlements/statement-store';
import { scheduledStatement } from '@/server/settlements/statement-view';

import { shopStatementsHref, statementHref, toPayoutDate } from '../../../format';
import { selectShopName } from '../../../queries';
import { ItemTable, PenaltiesCard, StatementCard } from '../../../statement-sections';

export const metadata: Metadata = { title: '지급 예정 정산서' };

type Params = Promise<{ shopId: string; payoutDate: string }>;

// 운영자 지급 예정 정산서 한 장 (A-105, W20 ④). 주소: /admin/settlements/shops/[shopId]/[payoutDate]
// 아직 목요일에 묶이지 않은 장이라 원장님 정산서(S-501)와 같은 계산으로 보여주고, 뗄 패널티·실지급액은 "예상"이다(11/14).
// 그 지급일이 이미 묶였으면 운영자 칸까지 보이는 묶인 정산서(/admin/settlements/[id])로 보낸다
export default function AdminScheduledStatementPage({ params }: { params: Params }) {
  return (
    <main className="flex w-full max-w-6xl flex-1 flex-col gap-4 p-6">
      <Suspense fallback={<DetailSkeleton />}>
        <Detail params={params} />
      </Suspense>
    </main>
  );
}

async function Detail({ params }: { params: Params }) {
  const admin = await ensureAdminPage();
  const { shopId, payoutDate: rawDate } = await params;
  const payoutDate = toPayoutDate(rawDate);
  if (!isUuid(shopId) || !payoutDate) notFound();
  const db = getDb();
  const shop = await selectShopName(db, shopId);
  if (!shop) notFound();

  const [stored] = await readShopSettlements(db, { shopId, payoutDate });
  if (stored) redirect(statementHref({ shopId, payoutDate, settlementId: stored.id }));

  const now = await getRequestNow();
  const [unpaidRows, penalties, lastPayoutDate, payoutAccount] = await Promise.all([
    readShopSettlementRows(db, { shopId, unpaidOnly: true }),
    readUnpaidPenalties(db, shopId),
    readLastPayoutDate(db, shopId),
    readPayoutAccount(db, shopId),
  ]);
  const statement = scheduledStatement({
    payoutDate,
    unpaidItems: toSettlementItemViews(unpaidRows, { now, paymentFeeRate: PAYMENT_FEE_RATE }),
    lastPayoutDate,
    penalties,
    payoutAccount,
  });
  if (!statement) notFound();
  await recordAdminAccess(admin.userId, {
    action: 'view',
    targetType: 'shop',
    targetId: shopId,
    path: `${shopStatementsHref(shopId)}/${payoutDate}`,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <BackButton fallbackHref={shopStatementsHref(shopId)} />
        <h1 className="text-xl font-bold">지급 예정 정산서</h1>
      </div>
      <StatementCard statement={statement} shop={shop} payoutAccount={payoutAccount} />
      <PenaltiesCard penalties={statement.penalties} estimated />
      <Card>
        <CardHeader>
          <CardTitle>거래 {statement.items.length}건</CardTitle>
        </CardHeader>
        <CardContent>
          <ItemTable items={statement.items} />
        </CardContent>
      </Card>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="불러오는 중">
      <Skeleton className="h-64 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}
