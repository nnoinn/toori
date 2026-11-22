import { Suspense } from 'react';
import { formatReservationCode } from '@/components/ui/reservation-code';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/state';
import { getDb } from '@/db';
import { formatWon } from '@/lib/format';
import { getRequestNow } from '@/lib/request-time';
import { formatKst, formatKstDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { recordAdminAccess } from '@/server/admin/access-log';
import { ensureAdminPage } from '@/server/auth';
import { STUCK_CANCEL_MINUTES, STUCK_ORDER_MINUTES } from '@/server/policy';

import { ADMIN_LIST_LIMIT } from '../lookup';
import { labelRefundReason } from '../reservations/format';
import { labelFailureCode, PAYMENT_ISSUES_PATH, STUCK_ORDER_LABELS } from './format';
import { IssueAction } from './issue-action';
import {
  type RefundReviewRow,
  selectRefundReviews,
  selectStuckCancels,
  selectStuckOrders,
  type StuckCancelRow,
  type StuckOrderRow,
  stuckSince,
} from './queries';

export const metadata: Metadata = { title: '결제·환불 확인' };

const HEAD_CELL = 'px-4 py-3 font-medium whitespace-nowrap';
const CELL = 'px-4 py-3';

// 결제·환불 확인 (#373 ①). 결제 정리 작업(10분마다)이 고치지 못하고 남은 주문·환불과, 금액 확인이 필요한 환불을 한 화면에 모은다.
// [다시 시도]는 정리 작업과 같은 처리를 한 번 더 하고, [확인함]은 확인했다고 기록만 한다. 둘 다 사유가 필수다
export default function AdminPaymentIssuesPage() {
  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">결제·환불 확인</h1>
        <p className="text-sm text-muted-foreground">
          결제 정리 작업(10분마다)이 고치지 못하고 남은 건이에요. [다시 시도]는 정리 작업과 같은
          처리를 한 번 더 하고, 금액은 지금 계산 그대로예요. 결과를 모르면 포트원 콘솔에서 결제
          번호로 찾아 보세요.
        </p>
      </div>
      <Suspense fallback={<ListSkeleton />}>
        <Issues />
      </Suspense>
    </main>
  );
}

async function Issues() {
  const admin = await ensureAdminPage();
  await recordAdminAccess(admin.userId, {
    action: 'search',
    targetType: 'list',
    path: PAYMENT_ISSUES_PATH,
  });
  const db = getDb();
  const since = stuckSince(await getRequestNow());
  const [stuckOrders, stuckCancels, reviews] = await Promise.all([
    selectStuckOrders(db, { createdBefore: since.orders }),
    selectStuckCancels(db, { requestedBefore: since.cancels }),
    selectRefundReviews(db),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <Section
        title="정리되지 않은 주문"
        description={`만든 지 ${STUCK_ORDER_MINUTES}분이 지났는데 아직 결제 대기이거나, 결제는 됐는데 예약이 확정되지 않은 주문이에요. 결제가 됐는데 예약이 안 된 주문은 정리하면 결제가 취소돼요.`}
        empty="정리되지 않은 주문이 없어요"
        hasMore={stuckOrders.hasMore}
      >
        {stuckOrders.rows.length > 0 ? <StuckOrdersTable rows={stuckOrders.rows} /> : null}
      </Section>
      <Section
        title="끝나지 않은 환불"
        description={`취소를 요청한 지 ${STUCK_CANCEL_MINUTES}분이 지났는데 환불 결과가 정해지지 않은 고객 취소·합의 후 취소예요.`}
        empty="끝나지 않은 환불이 없어요"
        hasMore={stuckCancels.hasMore}
      >
        {stuckCancels.rows.length > 0 ? <StuckCancelsTable rows={stuckCancels.rows} /> : null}
      </Section>
      <Section
        title="금액 확인이 필요한 환불"
        description="포트원이 돌려준 금액이 계산과 달랐던 환불이에요. 돈은 이미 실제 금액으로 돌아갔어요. 포트원 콘솔에서 확인하고 [확인함]을 눌러 주세요."
        empty="확인할 환불이 없어요"
        hasMore={reviews.hasMore}
      >
        {reviews.rows.length > 0 ? <RefundReviewsTable rows={reviews.rows} /> : null}
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  empty,
  hasMore,
  children,
}: {
  title: string;
  description: string;
  empty: string;
  hasMore: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children ?? <EmptyState title={empty} className="rounded-xl bg-card py-8" />}
      {hasMore ? (
        <p className="text-sm text-muted-foreground">
          오래된 {ADMIN_LIST_LIMIT}건까지 보여 줘요. 앞의 건을 정리하면 나머지가 보여요.
        </p>
      ) : null}
    </section>
  );
}

function TableFrame({ minWidth, children }: { minWidth: string; children: React.ReactNode }) {
  return (
    <div className="relative overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
      <table className={cn('w-full text-sm', minWidth)}>{children}</table>
    </div>
  );
}

function StuckOrdersTable({ rows }: { rows: StuckOrderRow[] }) {
  return (
    <TableFrame minWidth="min-w-[60rem]">
      <thead className="text-left text-muted-foreground">
        <tr className="border-b">
          <th className={HEAD_CELL}>주문 시각</th>
          <th className={HEAD_CELL}>상태</th>
          <th className={HEAD_CELL}>결제 번호</th>
          <th className={HEAD_CELL}>손님</th>
          <th className={HEAD_CELL}>샵 · 매물</th>
          <th className={cn(HEAD_CELL, 'text-right')}>결제액</th>
          <th className={HEAD_CELL}>마지막 확인</th>
          <th className={HEAD_CELL}>
            <span className="sr-only">처리</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const failure = labelFailureCode(row.failureCode);
          return (
            <tr key={row.orderId} className="border-b last:border-0">
              <td className={cn(CELL, 'whitespace-nowrap')}>{formatKstDateTime(row.createdAt)}</td>
              <td className={cn(CELL, 'whitespace-nowrap')}>
                {STUCK_ORDER_LABELS[row.status]}
                {failure ? <span className="block text-xs text-destructive">{failure}</span> : null}
              </td>
              <td className={cn(CELL, 'font-mono text-xs break-all')}>{row.paymentId}</td>
              <td className={CELL}>
                <Link href={`/admin/users/customers/${row.customerId}`} className="hover:underline">
                  <span className="whitespace-nowrap">{row.customerName}</span>
                </Link>
              </td>
              <td className={CELL}>
                <Link href={`/admin/shops/${row.shopId}`} className="hover:underline">
                  {row.shopName}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  {formatKst(row.slotStartAt)} · {row.menuName}
                </span>
              </td>
              <td className={cn(CELL, 'text-right whitespace-nowrap')}>{formatWon(row.amount)}</td>
              <td className={cn(CELL, 'whitespace-nowrap text-muted-foreground')}>
                {row.checkedAt.getTime() > row.createdAt.getTime()
                  ? formatKstDateTime(row.checkedAt)
                  : '아직 안 봄'}
              </td>
              <td className={cn(CELL, 'text-right whitespace-nowrap')}>
                <IssueAction kind="order" targetId={row.orderId} label={row.paymentId} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </TableFrame>
  );
}

function StuckCancelsTable({ rows }: { rows: StuckCancelRow[] }) {
  return (
    <TableFrame minWidth="min-w-[52rem]">
      <thead className="text-left text-muted-foreground">
        <tr className="border-b">
          <th className={HEAD_CELL}>요청 시각</th>
          <th className={HEAD_CELL}>예약번호</th>
          <th className={HEAD_CELL}>취소</th>
          <th className={HEAD_CELL}>손님 · 샵</th>
          <th className={HEAD_CELL}>결제 번호</th>
          <th className={cn(HEAD_CELL, 'text-right')}>돌려줄 금액</th>
          <th className={HEAD_CELL}>
            <span className="sr-only">처리</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.refundId} className="border-b last:border-0">
            <td className={cn(CELL, 'whitespace-nowrap')}>{formatKstDateTime(row.requestedAt)}</td>
            <td className={cn(CELL, 'whitespace-nowrap')}>
              <Link href={`/admin/reservations/${row.reservationId}`} className="hover:underline">
                {formatReservationCode(row.reservationCode)}
              </Link>
            </td>
            <td className={cn(CELL, 'whitespace-nowrap')}>{labelRefundReason(row.reason)}</td>
            <td className={CELL}>
              <span className="whitespace-nowrap">{row.customerName}</span>
              <span className="block text-xs text-muted-foreground">{row.shopName}</span>
            </td>
            <td className={cn(CELL, 'font-mono text-xs break-all')}>{row.paymentId}</td>
            <td className={cn(CELL, 'text-right whitespace-nowrap')}>
              {formatWon(row.refundAmount)}
            </td>
            <td className={cn(CELL, 'text-right whitespace-nowrap')}>
              <IssueAction
                kind="cancel"
                targetId={row.reservationId}
                label={formatReservationCode(row.reservationCode)}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </TableFrame>
  );
}

function RefundReviewsTable({ rows }: { rows: RefundReviewRow[] }) {
  return (
    <TableFrame minWidth="min-w-[60rem]">
      <thead className="text-left text-muted-foreground">
        <tr className="border-b">
          <th className={HEAD_CELL}>환불 시각</th>
          <th className={HEAD_CELL}>예약번호</th>
          <th className={HEAD_CELL}>환불</th>
          <th className={HEAD_CELL}>손님 · 샵</th>
          <th className={HEAD_CELL}>결제 번호</th>
          <th className={cn(HEAD_CELL, 'text-right')}>돌려준 금액</th>
          <th className={HEAD_CELL}>확인할 것</th>
          <th className={HEAD_CELL}>
            <span className="sr-only">처리</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.refundId} className="border-b last:border-0">
            <td className={cn(CELL, 'whitespace-nowrap')}>
              {row.processedAt ? formatKstDateTime(row.processedAt) : '-'}
            </td>
            <td className={cn(CELL, 'whitespace-nowrap')}>
              {row.reservationId && row.reservationCode ? (
                <Link href={`/admin/reservations/${row.reservationId}`} className="hover:underline">
                  {formatReservationCode(row.reservationCode)}
                </Link>
              ) : (
                <span className="text-muted-foreground">예약 전</span>
              )}
            </td>
            <td className={cn(CELL, 'whitespace-nowrap')}>{labelRefundReason(row.reason)}</td>
            <td className={CELL}>
              <span className="whitespace-nowrap">{row.customerName}</span>
              <span className="block text-xs text-muted-foreground">{row.shopName}</span>
            </td>
            <td className={cn(CELL, 'font-mono text-xs break-all')}>{row.paymentId}</td>
            <td className={cn(CELL, 'text-right whitespace-nowrap')}>
              {formatWon(row.refundAmount)}
            </td>
            <td className={cn(CELL, 'min-w-48')}>{row.reviewReason}</td>
            <td className={cn(CELL, 'text-right whitespace-nowrap')}>
              <IssueAction
                kind="review"
                targetId={row.refundId}
                label={row.reservationCode ?? row.paymentId}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </TableFrame>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex flex-col gap-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}
