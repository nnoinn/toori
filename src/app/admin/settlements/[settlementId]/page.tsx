import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BackButton } from '@/components/ui/back-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getDb } from '@/db';
import { formatWon } from '@/lib/format';
import { getRequestNow } from '@/lib/request-time';
import { formatKst, formatKstDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';
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
import type { SettlementStatement } from '@/server/settlements/types';

import { SETTLEMENT_KIND_LABELS, ZERO_REASON_LABELS } from '../format';
import {
  type SettlementItemExtra,
  selectSettlementItemExtras,
  selectSettlementOwner,
} from '../queries';
import { StatusBadge } from '../status-badge';

export const metadata: Metadata = { title: '정산서' };

type Params = Promise<{ settlementId: string }>;

const HEAD_CELL = 'px-3 py-2 font-medium';
const CELL = 'px-3 py-2';

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
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">
              {owner.shopName} · 지급일 {statement.payoutDate}
            </CardTitle>
            <StatusBadge status={stored.status} />
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 text-sm">
            <Field label="샵">
              <Link href={`/admin/shops/${owner.shopId}`} className="hover:underline">
                {owner.shopName}
              </Link>
            </Field>
            <Field label="기간">
              {statement.periodStart} ~ {statement.periodEnd}
            </Field>
            <Field label="거래">{countsLabel(statement.counts)}</Field>
            <Field label="기준 금액">{formatWon(statement.baseAmount)}</Field>
            <Field label="플랫폼 수수료">{formatWon(statement.platformFeeTotal)}(VAT 포함)</Field>
            <Field label="결제 수수료">
              {statement.paymentFeeTotal === null
                ? '-'
                : `${formatWon(statement.paymentFeeTotal)}(VAT 포함)`}
            </Field>
            <Field label="뗀 패널티">{formatWon(statement.penaltyDeducted ?? 0)}</Field>
            <Field label="실지급액">
              <span className="font-medium">{formatWon(statement.payoutAmount ?? 0)}</span>
              {statement.zeroReason ? ` · ${ZERO_REASON_LABELS[statement.zeroReason]}` : null}
            </Field>
            <Field label="지급 완료">
              {statement.paidAt ? formatKstDateTime(statement.paidAt) : '-'}
            </Field>
            <Field label="정산 계좌">
              {payoutAccount
                ? `${payoutAccount.bankName} · 끝 4자리 ${payoutAccount.accountLast4}`
                : '등록된 계좌 없음'}
              <span className="block text-xs text-muted-foreground">
                지금 등록된 계좌예요. 지급을 요청한 계좌는 PG 지급 요청을 만들 때 정산서에 남겨요.
              </span>
            </Field>
          </dl>
        </CardContent>
      </Card>

      <PayoutCard statement={statement} status={stored.status} />

      {statement.penalties.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>뗀 패널티</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 text-sm">
              {statement.penalties.map((penalty) => (
                <li key={penalty.reservationCode} className="flex justify-between gap-3">
                  <span>원장님 사정 취소 {penalty.reservationCode}</span>
                  <span>{formatWon(penalty.amount)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

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

/** 지급 요청·다시 요청. PG 지급대행 계약 전이라 잠가 둔다(투리는 돈을 직접 보내지 않는다, X-206) */
function PayoutCard({
  statement,
  status,
}: {
  statement: SettlementStatement;
  status: 'pending' | 'requested' | 'paid' | 'failed';
}) {
  const action =
    status === 'pending' && (statement.payoutAmount ?? 0) > 0
      ? '지급 요청'
      : status === 'failed'
        ? '다시 요청'
        : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>지급</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {status === 'paid' ? <p>지급을 마쳤어요.</p> : null}
        {status === 'requested' ? <p>PG에 지급을 요청했어요. 결과를 기다리는 중이에요.</p> : null}
        {action ? (
          <div className="flex flex-col gap-2">
            <Button disabled className="w-fit">
              {action}
            </Button>
            <p className="text-muted-foreground">
              PG 지급대행 계약 뒤에 열려요. 투리는 돈을 직접 보내지 않고, PG가 원장님 계좌로 보내요.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ItemTable({
  items,
  extras,
}: {
  items: SettlementStatement['items'];
  extras: Map<string, SettlementItemExtra>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[64rem] text-sm">
        <thead className="text-left text-muted-foreground">
          <tr className="border-b">
            <th className={HEAD_CELL}>예약번호</th>
            <th className={HEAD_CELL}>종류</th>
            <th className={HEAD_CELL}>서비스</th>
            <th className={cn(HEAD_CELL, 'text-right')}>판매가</th>
            <th className={cn(HEAD_CELL, 'text-right')}>기준 금액</th>
            <th className={cn(HEAD_CELL, 'text-right')}>수수료</th>
            <th className={cn(HEAD_CELL, 'text-right')}>정산액</th>
            <th className={cn(HEAD_CELL, 'text-right')}>쿠폰(투리 부담)</th>
            <th className={cn(HEAD_CELL, 'text-right')}>실제 PG 수수료</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const extra = extras.get(item.reservationId);
            const fee =
              item.paymentFee === null || item.paymentFeeVat === null
                ? null
                : item.platformFee + item.platformFeeVat + item.paymentFee + item.paymentFeeVat;
            return (
              <tr key={item.reservationId} className="border-b last:border-0">
                <td className={cn(CELL, 'whitespace-nowrap')}>
                  <Link
                    href={`/admin/reservations/${item.reservationId}`}
                    className="hover:underline"
                  >
                    {item.reservationCode}
                  </Link>
                </td>
                <td className={cn(CELL, 'whitespace-nowrap')}>
                  {SETTLEMENT_KIND_LABELS[item.kind]}
                  {item.penaltyRate !== null ? ` ${item.penaltyRate}%` : null}
                </td>
                <td className={CELL}>
                  {formatKst(new Date(item.startAt))} · {item.menuName}
                </td>
                <td className={cn(CELL, 'text-right whitespace-nowrap')}>
                  {formatWon(item.salePrice)}
                </td>
                <td className={cn(CELL, 'text-right whitespace-nowrap')}>
                  {formatWon(item.baseAmount)}
                </td>
                <td className={cn(CELL, 'text-right whitespace-nowrap')}>
                  {fee === null ? '-' : formatWon(fee)}
                </td>
                <td className={cn(CELL, 'text-right whitespace-nowrap')}>
                  {item.payoutAmount === null ? '-' : formatWon(item.payoutAmount)}
                </td>
                <td className={cn(CELL, 'text-right whitespace-nowrap')}>
                  {extra && extra.couponAmount > 0 ? formatWon(extra.couponAmount) : '-'}
                </td>
                <td className={cn(CELL, 'text-right whitespace-nowrap text-muted-foreground')}>
                  {extra?.pgFeeActual == null ? 'PG 정산 자료 전' : formatWon(extra.pgFeeActual)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function countsLabel(counts: SettlementStatement['counts']): string {
  const parts = (
    [
      ['sale', counts.sale],
      ['no_show', counts.no_show],
      ['penalty', counts.penalty],
      ['agreed_cancel', counts.agreed_cancel],
    ] as const
  )
    .filter(([, n]) => n > 0)
    .map(([kind, n]) => `${SETTLEMENT_KIND_LABELS[kind]} ${n}건`);
  return parts.length > 0 ? parts.join(' · ') : '없음';
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-all">{children}</dd>
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
