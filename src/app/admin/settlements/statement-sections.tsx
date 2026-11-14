// 운영자 정산서 한 장의 조각 (A-105). 묶인 정산서(/admin/settlements/[id])와 지급 예정 정산서
// (/admin/settlements/shops/[shopId]/[payoutDate])가 같이 쓴다. 숫자는 원장님 정산서(S-501)와 같은 함수 결과를 그대로 쓴다.

import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { SettlementStatus } from '@/db/schema/settlements';
import { formatWon } from '@/lib/format';
import { formatKst, formatKstDateTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { PayoutAccountView, SettlementStatement } from '@/server/settlements/types';

import {
  ESTIMATE_MARK,
  SETTLEMENT_KIND_LABELS,
  shopStatementsHref,
  ZERO_REASON_LABELS,
} from './format';
import type { SettlementItemExtra } from './queries';
import { StatusBadge } from './status-badge';

const HEAD_CELL = 'px-3 py-2 font-medium';
const CELL = 'px-3 py-2';

/** 정산서 요약 카드. 지급 예정(scheduled)이면 뗄 패널티·실지급액에 "예상"을 붙인다(11/14 nnoinn) */
export function StatementCard({
  statement,
  shop,
  payoutAccount,
}: {
  statement: SettlementStatement;
  shop: { shopId: string; shopName: string };
  payoutAccount: PayoutAccountView | null;
}) {
  const estimated = statement.status === 'scheduled';
  const mark = estimated ? ` ${ESTIMATE_MARK}` : '';
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">
            {shop.shopName} · 지급일 {statement.payoutDate}
          </CardTitle>
          <StatusBadge status={statement.status} />
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 text-sm">
          <Field label="샵">
            <Link href={shopStatementsHref(shop.shopId)} className="hover:underline">
              {shop.shopName}
            </Link>
            <span className="text-muted-foreground"> · 이 샵 정산서 모두 보기</span>
          </Field>
          <Field label="기간">
            {statement.periodStart} ~ {statement.periodEnd}
          </Field>
          <Field label="거래">{countsLabel(statement.counts)}</Field>
          <Field label="기준 금액">{formatWon(statement.baseAmount)}</Field>
          <Field label="플랫폼 수수료">{formatWon(statement.platformFeeTotal)}(VAT 포함)</Field>
          <Field label="결제 수수료">
            {statement.paymentFeeTotal === null
              ? '결제 수수료율이 정해지기 전이에요'
              : `${formatWon(statement.paymentFeeTotal)}(VAT 포함)`}
          </Field>
          <Field label={`뗀 패널티${mark}`}>
            {statement.penaltyDeducted === null ? '-' : formatWon(statement.penaltyDeducted)}
          </Field>
          <Field label={`실지급액${mark}`}>
            <span className="font-medium">
              {statement.payoutAmount === null ? '-' : formatWon(statement.payoutAmount)}
            </span>
            {statement.zeroReason ? ` · ${ZERO_REASON_LABELS[statement.zeroReason]}` : null}
          </Field>
          {estimated ? (
            <Field label="확정">
              지급일 새벽에 묶이면 금액이 확정돼요. 그 전에 원장님 사정 취소가 생기면 뗄 패널티가
              달라질 수 있어요.
            </Field>
          ) : (
            <Field label="지급 완료">
              {statement.paidAt ? formatKstDateTime(statement.paidAt) : '-'}
            </Field>
          )}
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
  );
}

/** 지급 요청·다시 요청. PG 지급대행 계약 전이라 잠가 둔다(투리는 돈을 직접 보내지 않는다, X-206) */
export function PayoutCard({
  status,
  payoutAmount,
}: {
  status: SettlementStatus;
  payoutAmount: number | null;
}) {
  const action =
    status === 'pending' && (payoutAmount ?? 0) > 0
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

/** 뗀(지급 예정이면 뗄 예상) 패널티 건별 */
export function PenaltiesCard({
  penalties,
  estimated,
}: {
  penalties: SettlementStatement['penalties'];
  estimated: boolean;
}) {
  if (penalties.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{estimated ? `뗄 패널티 ${ESTIMATE_MARK}` : '뗀 패널티'}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1 text-sm">
          {penalties.map((penalty) => (
            <li key={penalty.reservationCode} className="flex justify-between gap-3">
              <span>원장님 사정 취소 {penalty.reservationCode}</span>
              <span>{formatWon(penalty.amount)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * 거래 줄. extras(운영자 칸: 쿠폰 금액·실제 PG 수수료)는 묶인 정산서만 있다.
 * 지급 예정 정산서는 아직 정산 줄이 없어서 쿠폰은 쓴 예약인지만, 실제 PG 수수료는 "묶기 전"으로 보여준다
 */
export function ItemTable({
  items,
  extras,
}: {
  items: SettlementStatement['items'];
  extras?: Map<string, SettlementItemExtra>;
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
            const extra = extras?.get(item.reservationId);
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
                  {extras
                    ? extra && extra.couponAmount > 0
                      ? formatWon(extra.couponAmount)
                      : '-'
                    : item.couponUsed
                      ? '사용'
                      : '-'}
                </td>
                <td className={cn(CELL, 'text-right whitespace-nowrap text-muted-foreground')}>
                  {!extras
                    ? '묶기 전'
                    : extra?.pgFeeActual == null
                      ? 'PG 정산 자료 전'
                      : formatWon(extra.pgFeeActual)}
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

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-all">{children}</dd>
    </div>
  );
}
