import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BackButton } from '@/components/ui/back-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DetailLink, SelectableRow, SelectableRows } from '@/components/ui/selectable-rows';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/state';
import { getDb } from '@/db';
import { formatWon } from '@/lib/format';
import { getRequestNow } from '@/lib/request-time';
import { formatKstDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';
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
import { buildStatementList } from '@/server/settlements/statement-view';
import type { SettlementStatementList } from '@/server/settlements/types';

import { ESTIMATE_MARK, SETTLEMENT_KIND_LABELS, statementHref } from '../../format';
import { selectShopName } from '../../queries';
import { Field } from '../../statement-sections';
import { StatusBadge } from '../../status-badge';

export const metadata: Metadata = { title: '샵 정산' };

type Params = Promise<{ shopId: string }>;

const HEAD_CELL = 'px-4 py-3 font-medium';
const CELL = 'px-4 py-3';

/** 샵의 정산서를 모두 본다(지급일 기간 없이). 샵 하나는 1년에 52장쯤이라 한 번에 보여준다 */
const ALL_PERIOD = { from: '0000-01-01', to: '9999-12-31' };

// 운영자 샵 정산 (A-105, W20 ④). 주소: /admin/settlements/shops/[shopId]
// 원장님 정산서 목록(S-501, #408)과 같은 함수로, 묶인 정산서와 아직 묶이지 않은 지급 예정 정산서·이의제기 보류 거래를 같이 본다.
// 원장님이 "다음 주에 얼마 받아요?"라고 물으면 같은 숫자로 답한다(#129 3장). 지급 예정의 뗄 패널티·실지급액은 "예상"이다(11/14)
export default function AdminShopSettlementsPage({ params }: { params: Params }) {
  return (
    <main className="flex w-full max-w-6xl flex-1 flex-col gap-4 p-6">
      <Suspense fallback={<PageSkeleton />}>
        <ShopSettlements params={params} />
      </Suspense>
    </main>
  );
}

async function ShopSettlements({ params }: { params: Params }) {
  const admin = await ensureAdminPage();
  const { shopId } = await params;
  if (!isUuid(shopId)) notFound();
  const db = getDb();
  const shop = await selectShopName(db, shopId);
  if (!shop) notFound();
  await recordAdminAccess(admin.userId, {
    action: 'view',
    targetType: 'shop',
    targetId: shopId,
    path: `/admin/settlements/shops/${shopId}`,
  });

  const now = await getRequestNow();
  const [stored, unpaidRows, penalties, lastPayoutDate, payoutAccount] = await Promise.all([
    readShopSettlements(db, { shopId }),
    readShopSettlementRows(db, { shopId, unpaidOnly: true }),
    readUnpaidPenalties(db, shopId),
    readLastPayoutDate(db, shopId),
    readPayoutAccount(db, shopId),
  ]);
  const list = buildStatementList({
    stored,
    unpaidItems: toSettlementItemViews(unpaidRows, { now, paymentFeeRate: PAYMENT_FEE_RATE }),
    lastPayoutDate,
    penalties,
    payoutAccount,
    period: ALL_PERIOD,
    now,
  });
  const idByDate = new Map(stored.map((settlement) => [settlement.periodEnd, settlement.id]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <BackButton fallbackHref="/admin/settlements" />
        <h1 className="text-xl font-bold">{shop.shopName} 정산</h1>
      </div>

      <Card>
        <CardContent>
          <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 text-sm">
            <Field label="샵">
              <Link href={`/admin/shops/${shopId}`} className="hover:underline">
                {shop.shopName}
              </Link>
            </Field>
            <Field label="남은 패널티">
              {formatWon(list.outstandingPenalty)}
              {list.outstandingPenalty > 0 ? ' · 다음 정산에서 오래된 것부터 떼요' : null}
            </Field>
            <Field label="정산 계좌">
              {list.payoutAccount
                ? `${list.payoutAccount.bankName} · 끝 4자리 ${list.payoutAccount.accountLast4}`
                : '등록된 계좌 없음'}
            </Field>
            <Field label="정산 보류">
              {list.held.count === 0
                ? '없음'
                : `이의제기 확인 중 ${list.held.count}건 · 기준 금액 ${formatWon(list.held.baseAmount)}. 결론이 나면 그다음 지급일에 들어가요`}
            </Field>
          </dl>
        </CardContent>
      </Card>

      {list.statements.length === 0 ? (
        <EmptyState title="정산서가 없어요" className="rounded-xl bg-card" />
      ) : (
        <StatementTable shopId={shopId} list={list} idByDate={idByDate} />
      )}

      {list.held.count > 0 ? <HeldTable items={list.held.items} /> : null}
    </div>
  );
}

function StatementTable({
  shopId,
  list,
  idByDate,
}: {
  shopId: string;
  list: SettlementStatementList;
  idByDate: Map<string, string>;
}) {
  return (
    <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
      <table className="w-full min-w-[64rem] text-sm">
        <thead className="text-left text-muted-foreground">
          <tr className="border-b">
            <th className={HEAD_CELL}>지급일</th>
            <th className={HEAD_CELL}>기간</th>
            <th className={cn(HEAD_CELL, 'text-right')}>건수</th>
            <th className={cn(HEAD_CELL, 'text-right')}>기준 금액</th>
            <th className={cn(HEAD_CELL, 'text-right')}>뗀 패널티</th>
            <th className={cn(HEAD_CELL, 'text-right')}>실지급액</th>
            <th className={HEAD_CELL}>상태</th>
            <th className={HEAD_CELL}>
              <span className="sr-only">상세</span>
            </th>
          </tr>
        </thead>
        <SelectableRows>
          {list.statements.map((statement) => {
            const href = statementHref({
              shopId,
              payoutDate: statement.payoutDate,
              settlementId: idByDate.get(statement.payoutDate),
            });
            const mark = statement.status === 'scheduled' ? ` ${ESTIMATE_MARK}` : '';
            const count = Object.values(statement.counts).reduce((sum, n) => sum + n, 0);
            return (
              <SelectableRow key={statement.payoutDate} id={statement.payoutDate} href={href}>
                <td className={cn(CELL, 'whitespace-nowrap')}>{statement.payoutDate}</td>
                <td className={cn(CELL, 'whitespace-nowrap text-muted-foreground')}>
                  {statement.periodStart} ~ {statement.periodEnd}
                </td>
                <td className={cn(CELL, 'text-right')}>{count}</td>
                <td className={cn(CELL, 'text-right whitespace-nowrap')}>
                  {formatWon(statement.baseAmount)}
                </td>
                <td className={cn(CELL, 'text-right whitespace-nowrap')}>
                  {statement.penaltyDeducted === null
                    ? '-'
                    : `${formatWon(statement.penaltyDeducted)}${mark}`}
                </td>
                <td className={cn(CELL, 'text-right font-medium whitespace-nowrap')}>
                  {statement.payoutAmount === null
                    ? '-'
                    : `${formatWon(statement.payoutAmount)}${mark}`}
                </td>
                <td className={CELL}>
                  <StatusBadge status={statement.status} />
                </td>
                <td className={cn(CELL, 'text-right')}>
                  <DetailLink href={href} label={`${statement.payoutDate} 정산서`} />
                </td>
              </SelectableRow>
            );
          })}
        </SelectableRows>
      </table>
    </div>
  );
}

/** 이의제기로 보류 중인 거래. 결론이 나면 그다음 지급일 정산서에 들어간다 */
function HeldTable({ items }: { items: SettlementStatementList['held']['items'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>정산 보류 {items.length}건</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1 text-sm">
          {items.map((item) => (
            <li key={item.reservationId} className="flex flex-wrap justify-between gap-3">
              <span>
                <Link
                  href={`/admin/reservations/${item.reservationId}`}
                  className="hover:underline"
                >
                  {item.reservationCode}
                </Link>{' '}
                · {SETTLEMENT_KIND_LABELS[item.kind]}
                {item.hold ? ` · 이의제기 ${formatKstDateTime(item.hold.receivedAt)} 접수` : null}
              </span>
              <span>기준 금액 {formatWon(item.baseAmount)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="불러오는 중">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
