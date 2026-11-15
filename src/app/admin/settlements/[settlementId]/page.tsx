import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

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
  readPayoutAccount,
  readPenaltyCollections,
  readShopSettlements,
} from '@/server/settlements/statement-store';
import { storedStatement } from '@/server/settlements/statement-view';

import { selectSettlementItemExtras, selectSettlementOwner } from '../queries';
import { ItemTable, PayoutCard, PenaltiesCard, StatementCard } from '../statement-sections';

export const metadata: Metadata = { title: '정산서' };

type Params = Promise<{ settlementId: string }>;

// 운영자 정산서 한 장 (A-105, W20 ④). 주소: /admin/settlements/[settlementId]
// 원장님 정산서(S-501, #408)와 같은 함수로 합계·거래·뗀 패널티를 보여주고, 운영자만 보는 칸(쿠폰·실제 PG 수수료)을 더한다.
// 원장님이 문의하면 같은 화면을 보며 답한다(#129 3장). 지급 요청·다시 요청은 PG 지급대행 계약 뒤에 연다
export default function AdminSettlementPage({ params }: { params: Params }) {
  return (
    <main className="flex w-full max-w-6xl flex-1 flex-col gap-4 p-6">
      <div className="flex items-center gap-2">
        <BackButton fallbackHref="/admin/settlements" />
        <h1 className="text-xl font-bold">정산서</h1>
      </div>
      <Suspense fallback={<DetailSkeleton />}>
        <Detail params={params} />
      </Suspense>
    </main>
  );
}

async function Detail({ params }: { params: Params }) {
  const admin = await ensureAdminPage();
  const { settlementId } = await params;
  if (!isUuid(settlementId)) notFound();
  const db = getDb();
  const owner = await selectSettlementOwner(db, settlementId);
  if (!owner) notFound();
  await recordAdminAccess(admin.userId, {
    action: 'view',
    targetType: 'settlement',
    targetId: settlementId,
    path: `/admin/settlements/${settlementId}`,
  });

  const now = await getRequestNow();
  const [[stored], rows, penalties, payoutAccount, extras] = await Promise.all([
    readShopSettlements(db, { shopId: owner.shopId, payoutDate: owner.payoutDate }),
    readShopSettlementRows(db, { shopId: owner.shopId, settlementId }),
    readPenaltyCollections(db, [settlementId]),
    readPayoutAccount(db, owner.shopId),
    selectSettlementItemExtras(db, settlementId),
  ]);
  if (!stored) notFound();
  const statement = storedStatement({
    stored,
    items: toSettlementItemViews(rows, { now, paymentFeeRate: PAYMENT_FEE_RATE }),
    penalties,
    payoutAccount,
  });

  return (
    <div className="flex flex-col gap-4">
      <StatementCard statement={statement} shop={owner} payoutAccount={payoutAccount} />
      <PayoutCard status={stored.status} payoutAmount={statement.payoutAmount} />
      <PenaltiesCard penalties={statement.penalties} estimated={false} />
      <Card>
        <CardHeader>
          <CardTitle>거래 {statement.items.length}건</CardTitle>
        </CardHeader>
        <CardContent>
          <ItemTable items={statement.items} extras={extras} />
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
