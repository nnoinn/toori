// 원장님 정산서 목록 (O15, S-501, 연결 #10, #129 2장). 서버에서 그리는 부품이라 상태가 없다.
// 지급일 하나에 한 줄. 접힌 줄: 지급일·기간, 거래 수(종류별), 기준 금액, 실지급액(0원 이유나 뗀 패널티), 상태.
// 줄을 누르면 주소에 payout=지급일을 넣어 그 장만 펼친다(한 번에 한 장, 알림 등에서 그 장으로 바로 보낼 수 있다).
// 펼친 장은 getSettlementStatement로 읽어 정산 계산(합계·수수료·패널티·실지급액), 뗀 패널티 건별, 지급(상태·정산 계좌),
// 거래 줄(거래 내역 S-502와 같은 모양)을 보여준다. 지급 예정 장의 뗄 패널티는 "예상"으로 표시한다(11/14 nnoinn).
// 금액·상태·지급일은 함수 결과 그대로 쓰고 여기서 계산하지 않는다. 문구는 settlement-format.ts.

import { Suspense } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { cn } from 'cn';

import { formatReservationCode } from '@/components/ui/reservation-code';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/state';
import { formatWon } from '@/lib/format';
import { formatKst } from '@/lib/time';
import { getSettlementStatement } from '@/server/settlements/get-settlement-statements';
import type { SettlementStatement, SettlementStatementSummary } from '@/server/settlements/types';

import { SETTLEMENT_STATUS_TEXT_STYLE } from '../status-style';
import {
  EXPECTED_PENALTY_NOTE,
  formatDateKey,
  minusWon,
  payoutAccountText,
  periodHrefValue,
  periodLabel,
  type SettlementPeriod,
  settlementsHref,
  settlementStatusText,
  STATEMENT_STATUS_LABELS,
  statementAmountNote,
  statementCountsText,
  statementPenaltyLabel,
  statementTotalCount,
  UNKNOWN_FEE_NOTE,
  UNKNOWN_LABEL,
  wonOrUnknown,
  zeroReasonText,
} from './settlement-format';
import { Row, Section, SettlementItemList } from './settlement-rows';

// 접힌 줄과 머리줄이 같은 폭을 써서 칸이 위아래로 맞는다
const DATE_COLUMN = 'w-40 shrink-0';
const AMOUNT_COLUMN = 'w-28 shrink-0 text-right';
const PAYOUT_COLUMN = 'w-40 shrink-0 text-right';
const STATUS_COLUMN = 'w-28 shrink-0 text-right';
const ROW_GAP = 'flex items-center gap-3 px-4';

/** 정산서 목록. 지급일이 늦은 것부터(함수가 준 순서 그대로). openPayout은 펼친 장의 지급일 */
export function StatementList({
  shopId,
  statements,
  period,
  openPayout,
  now,
}: {
  shopId: string;
  statements: readonly SettlementStatementSummary[];
  period: SettlementPeriod;
  openPayout: string | null;
  /** 서버 시각. 펼친 장의 거래 줄에서 이의제기 접수 기한이 지났는지 볼 때 쓴다 */
  now: Date;
}) {
  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className={cn(ROW_GAP, 'border-b py-2 text-xs text-muted-foreground')} aria-hidden>
        <span className={DATE_COLUMN}>지급일 · 기간</span>
        <span className="flex-1">거래</span>
        <span className={AMOUNT_COLUMN}>기준 금액</span>
        <span className={PAYOUT_COLUMN}>실지급액</span>
        <span className={STATUS_COLUMN}>상태</span>
        {/* 펼침 표시 자리 */}
        <span className="size-4 shrink-0" />
      </div>
      <ul className="divide-y">
        {statements.map((summary) => {
          const open = summary.payoutDate === openPayout;
          return (
            <li key={summary.payoutDate}>
              <StatementRow
                summary={summary}
                open={open}
                // 펼친 장을 다시 누르면 접는다. 보던 기간은 그대로
                href={settlementsHref(periodHrefValue(period), {
                  payout: open ? null : summary.payoutDate,
                })}
              />
              {open ? (
                <Suspense fallback={<DetailLoading />}>
                  <StatementDetail shopId={shopId} payoutDate={summary.payoutDate} now={now} />
                </Suspense>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StatementRow({
  summary,
  open,
  href,
}: {
  summary: SettlementStatementSummary;
  open: boolean;
  href: string;
}) {
  const note = statementAmountNote(summary);
  return (
    <Link
      href={href}
      scroll={false}
      aria-expanded={open}
      className={cn(ROW_GAP, 'py-3 hover:bg-muted/40', open && 'bg-muted/40')}
    >
      <div className={cn(DATE_COLUMN, 'text-sm')}>
        <p className="font-semibold">{formatDateKey(summary.payoutDate)}</p>
        <p className="text-xs text-muted-foreground">
          {periodLabel(summary.periodStart, summary.periodEnd)}
        </p>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium">{statementTotalCount(summary.counts)}건</span>
        <span className="truncate text-xs text-muted-foreground">
          {statementCountsText(summary.counts)}
        </span>
      </div>
      <span className={cn(AMOUNT_COLUMN, 'tabular-nums')}>{formatWon(summary.baseAmount)}</span>
      <div className={PAYOUT_COLUMN}>
        <p className="font-semibold tabular-nums">{wonOrUnknown(summary.payoutAmount)}</p>
        {note ? <p className="text-xs text-warning-foreground">{note}</p> : null}
      </div>
      <span className={cn(STATUS_COLUMN, 'text-xs', SETTLEMENT_STATUS_TEXT_STYLE[summary.status])}>
        {STATEMENT_STATUS_LABELS[summary.status]}
      </span>
      <ChevronDown
        className={cn(
          'size-4 shrink-0 text-muted-foreground transition-transform',
          open && 'rotate-180',
        )}
        aria-hidden
      />
    </Link>
  );
}

function DetailLoading() {
  return (
    <div className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-4" aria-busy>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

/** 정산서 한 장 펼치기. 함수가 없다고 하면(그사이 지급일이 바뀜 등) 안내만 한다 */
async function StatementDetail({
  shopId,
  payoutDate,
  now,
}: {
  shopId: string;
  payoutDate: string;
  now: Date;
}) {
  const result = await getSettlementStatement({ shopId, payoutDate });
  if (!result.ok) {
    return (
      <div className="border-t px-4 py-4">
        <ErrorState title="정산서를 불러오지 못했어요" description={result.error.message} />
      </div>
    );
  }
  const statement = result.data;
  const hasPenalties = statement.penalties.length > 0;
  return (
    <div className="flex flex-col gap-4 border-t bg-muted/20 px-4 py-4">
      {/* 뗀 패널티가 있으면 넓을 때 정산 계산·패널티·지급 3칸, 없으면 정산 계산·지급 2칸 */}
      <div className={cn('grid gap-4 md:grid-cols-2', hasPenalties && 'xl:grid-cols-3')}>
        <CalcSection statement={statement} />
        {hasPenalties ? <PenaltySection statement={statement} /> : null}
        <PayoutSection statement={statement} />
      </div>
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold text-muted-foreground">
          이 정산서의 거래 {statement.items.length}건
        </h3>
        <SettlementItemList items={statement.items} now={now} />
      </section>
    </div>
  );
}

/** 정산 계산: 건수, 기준 금액 합계, 수수료 + VAT 합계, 뗀(뗄) 패널티, 실지급액과 0원 이유 */
function CalcSection({ statement }: { statement: SettlementStatement }) {
  return (
    <Section title="정산 계산">
      <Row
        label="거래"
        value={`${statementTotalCount(statement.counts)}건`}
        note={statementCountsText(statement.counts)}
      />
      <Row label="기준 금액 합계" value={formatWon(statement.baseAmount)} />
      <Row label="플랫폼 수수료 + VAT" value={minusWon(statement.platformFeeTotal)} />
      <Row label="결제 수수료 + VAT" value={minusWon(statement.paymentFeeTotal)} />
      <Row
        label={statementPenaltyLabel(statement.status)}
        value={minusWon(statement.penaltyDeducted)}
      />
      <div className="border-t pt-2">
        <Row
          label="실지급액"
          value={wonOrUnknown(statement.payoutAmount)}
          note={zeroReasonText(statement)}
          strong
        />
      </div>
      {statement.paymentFeeTotal === null ? (
        <p className="text-xs text-muted-foreground">
          {UNKNOWN_FEE_NOTE} 그 전에는 결제 수수료·패널티·실지급액을 {UNKNOWN_LABEL}으로 보여
          드려요.
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        수수료 비율은 아래 거래 줄을 누르면 거래마다 볼 수 있어요.
      </p>
    </Section>
  );
}

/** 이번에 뗀(지급 예정이면 뗄) 패널티 건별: 원장님 사정 취소 예약번호와 금액 */
function PenaltySection({ statement }: { statement: SettlementStatement }) {
  const scheduled = statement.status === 'scheduled';
  return (
    <Section title={statementPenaltyLabel(statement.status)}>
      <ul className="flex flex-col gap-1">
        {statement.penalties.map((penalty, index) => (
          <li key={`${penalty.reservationCode}-${index}`}>
            <Row
              label={`예약 ${formatReservationCode(penalty.reservationCode)}`}
              value={formatWon(penalty.amount)}
            />
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        원장님 사정 취소 패널티예요.{scheduled ? ` ${EXPECTED_PENALTY_NOTE}` : ''}
      </p>
    </Section>
  );
}

/** 지급: 상태(지급일), 지급한 시각, 정산 계좌(지금 등록된 계좌, 11/13 nnoinn) */
function PayoutSection({ statement }: { statement: SettlementStatement }) {
  return (
    <Section title="지급">
      <p className={cn('font-medium', SETTLEMENT_STATUS_TEXT_STYLE[statement.status])}>
        {settlementStatusText(statement)}
      </p>
      {statement.paidAt ? (
        <Row label="지급한 시각" value={formatKst(new Date(statement.paidAt))} />
      ) : null}
      {statement.payoutAccount ? (
        <Row
          label="정산 계좌"
          value={payoutAccountText(statement.payoutAccount)}
          note="지금 등록된 계좌예요"
        />
      ) : (
        <p className="text-warning-foreground">
          정산 계좌가 없어요.{' '}
          <Link href="/owner/settings/payout" className="font-medium underline">
            정산 계좌 등록
          </Link>
        </p>
      )}
    </Section>
  );
}
