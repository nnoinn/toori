// 원장님 정산 내역 위 요약 카드 (O15, S-502). 서버에서 그리는 부품이라 상태가 없다.
// 다음 지급(기간과 상관없이, 받는 계좌), 이 기간 합계, 남은 패널티(있을 때만, 11/14 정민석).
// 합계·다음 지급·남은 패널티는 getSettlementItems 결과 그대로 쓰고 화면에서 더하거나 빼지 않는다.
// 받는 계좌는 지금 등록된 계좌(은행·끝 4자리)다. 지급을 요청한 계좌를 정산에 남기는 칸은 PG 지급 요청 때 생긴다(11/13 nnoinn).

import Link from 'next/link';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatWon } from '@/lib/format';
import { bankName } from '@/server/policy';
import type { SettlementList } from '@/server/settlements/types';

import type { PayoutAccountView } from '../settings/payout/payout-store';
import {
  formatDateKey,
  periodLabel,
  UNKNOWN_FEE_NOTE,
  UNKNOWN_LABEL,
  wonOrUnknown,
} from './settlement-format';

export function SettlementSummaryCards({
  list,
  from,
  to,
  account,
}: {
  list: SettlementList;
  from: string;
  to: string;
  account: PayoutAccountView | null;
}) {
  const hasPenalty = list.outstandingPenalty > 0;
  return (
    <div className={hasPenalty ? 'grid gap-4 md:grid-cols-3' : 'grid gap-4 md:grid-cols-2'}>
      <NextPayoutCard list={list} account={account} />
      <PeriodSummaryCard list={list} from={from} to={to} />
      {hasPenalty ? <OutstandingPenaltyCard amount={list.outstandingPenalty} /> : null}
    </div>
  );
}

/** 다음 지급: 날짜·건수·금액(패널티를 떼기 전)과 받는 계좌 */
function NextPayoutCard({
  list,
  account,
}: {
  list: SettlementList;
  account: PayoutAccountView | null;
}) {
  const next = list.nextPayout;
  return (
    <Card>
      <CardHeader>
        <CardTitle>다음 지급</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {next ? (
          <>
            <p className="text-2xl font-bold">{formatDateKey(next.date)}</p>
            <p>
              {next.count}건 ·{' '}
              <span className="font-semibold">{wonOrUnknown(next.payoutAmount)}</span>
            </p>
            {list.outstandingPenalty > 0 ? (
              <p className="text-xs text-muted-foreground">
                패널티를 떼기 전 금액이에요. 남은 패널티는 이 금액에서 먼저 떼요.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-muted-foreground">지급 예정인 거래가 없어요</p>
        )}
        <div className="border-t pt-2 text-sm">
          {account ? (
            <p>
              <span className="text-muted-foreground">받는 계좌 </span>
              {bankName(account.bankCode)} ****{account.accountLast4}
            </p>
          ) : (
            <p className="text-warning-foreground">
              정산 계좌가 없어요.{' '}
              <Link href="/owner/settings/payout" className="font-medium underline">
                정산 계좌 등록
              </Link>
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** 이 기간 합계: 건수, 기준 금액, 수수료(플랫폼 + 결제, VAT 포함), 정산액, 보류 건수 */
function PeriodSummaryCard({ list, from, to }: { list: SettlementList; from: string; to: string }) {
  const { summary } = list;
  const excluded = list.items.some((item) => item.status === 'no_payout');
  return (
    <Card>
      <CardHeader>
        <CardTitle>이 기간 합계</CardTitle>
        <p className="text-xs text-muted-foreground">{periodLabel(from, to)}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">거래</dt>
          <dd className="text-right tabular-nums">{summary.count}건</dd>
          <dt className="text-muted-foreground">기준 금액</dt>
          <dd className="text-right tabular-nums">{formatWon(summary.baseAmount)}</dd>
          <dt className="text-muted-foreground">수수료 (VAT 포함)</dt>
          <dd className="text-right tabular-nums">
            {summary.feeAmount === null ? wonOrUnknown(null) : `− ${formatWon(summary.feeAmount)}`}
          </dd>
          <dt className="font-semibold">정산액</dt>
          <dd className="text-right font-bold tabular-nums">
            {wonOrUnknown(summary.payoutAmount)}
          </dd>
        </dl>
        {summary.heldCount > 0 ? (
          <p className="text-xs text-warning-foreground">
            이의제기로 보류 중인 {summary.heldCount}건이 들어 있어요.
          </p>
        ) : null}
        {excluded ? (
          <p className="text-xs text-muted-foreground">
            원장님 사정 취소처럼 정산할 금액이 없는 거래는 합계에 넣지 않아요.
          </p>
        ) : null}
        {summary.payoutAmount === null && summary.count > 0 ? (
          <p className="text-xs text-muted-foreground">
            {UNKNOWN_FEE_NOTE} 그 전에는 결제 수수료와 정산액을 {UNKNOWN_LABEL}으로 보여 드려요.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** 남은 패널티(원장님 사정 취소, S-409). 0원이면 이 카드를 두지 않는다(11/14 정민석) */
function OutstandingPenaltyCard({ amount }: { amount: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>남은 패널티</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-2xl font-bold text-warning-foreground">{formatWon(amount)}</p>
        <p className="text-xs text-muted-foreground">
          원장님 사정 취소 패널티 중 아직 떼지 못한 금액이에요. 다음 정산금에서 먼저 떼요.
        </p>
      </CardContent>
    </Card>
  );
}
