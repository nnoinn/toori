// 원장님 정산 내역의 거래 줄 (O15, S-502 거래별 상세). 서버에서 그리는 부품이라 상태가 없다.
// 접힌 줄: 서비스 일시·예약번호, 메뉴·종류, 정산액, 지급 상태. 누르면(<details>) 금액이 왜 이렇게 나왔는지 펼친다(11/12 nnoinn):
// 거래(서비스·처리 시각·정가·할인율·판매가·쿠폰), 정산 계산(기준 금액 식·수수료·정산액), 지급(상태·이의제기 접수 기한·보류 이유).
// 금액·상태·지급일은 getSettlementItems 결과 그대로 쓰고 여기서 계산하지 않는다. 문구는 settlement-format.ts.

import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { cn } from 'cn';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatReservationCode } from '@/components/ui/reservation-code';
import { formatWon } from '@/lib/format';
import { formatKst } from '@/lib/time';
import type { SettlementItemView } from '@/server/settlements/types';

import { SETTLEMENT_KIND_STYLE, SETTLEMENT_STATUS_TEXT_STYLE } from '../status-style';
import {
  baseAmountFormula,
  disputeDeadlineText,
  feeRateLabel,
  hoursBeforeText,
  minusWon,
  OCCURRED_LABELS,
  SETTLEMENT_KIND_LABELS,
  settlementStatusText,
  wonOrUnknown,
} from './settlement-format';

// 접힌 줄과 머리줄이 같은 폭을 써서 칸이 위아래로 맞는다
const DATE_COLUMN = 'w-32 shrink-0';
const AMOUNT_COLUMN = 'w-28 shrink-0 text-right';
const STATUS_COLUMN = 'w-32 shrink-0 text-right';
const ROW_GAP = 'flex items-center gap-3 px-4';

/** 거래 목록. 처리·취소 시각이 늦은 것부터(함수가 준 순서 그대로) */
export function SettlementItemList({
  items,
  now,
}: {
  items: readonly SettlementItemView[];
  now: Date;
}) {
  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className={cn(ROW_GAP, 'border-b py-2 text-xs text-muted-foreground')} aria-hidden>
        <span className={DATE_COLUMN}>서비스 일시</span>
        <span className="flex-1">메뉴</span>
        <span className={AMOUNT_COLUMN}>기준 금액</span>
        <span className={AMOUNT_COLUMN}>정산액</span>
        <span className={STATUS_COLUMN}>지급</span>
        {/* 펼침 표시 자리 */}
        <span className="size-4 shrink-0" />
      </div>
      <ul className="divide-y">
        {items.map((item) => (
          <li key={item.reservationId}>
            <SettlementItemRow item={item} now={now} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SettlementItemRow({ item, now }: { item: SettlementItemView; now: Date }) {
  const noPayout = item.status === 'no_payout';
  return (
    <details className="group">
      <summary className={cn(ROW_GAP, 'cursor-pointer list-none py-3 hover:bg-muted/40')}>
        <div className={cn(DATE_COLUMN, 'text-sm')}>
          <p className="font-semibold">{formatKst(new Date(item.startAt))}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatReservationCode(item.reservationCode)}
          </p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <span className="max-w-full truncate font-medium">{item.menuName}</span>
          <Badge className={SETTLEMENT_KIND_STYLE[item.kind]}>
            {SETTLEMENT_KIND_LABELS[item.kind]}
          </Badge>
        </div>
        <span className={cn(AMOUNT_COLUMN, 'tabular-nums')}>{formatWon(item.baseAmount)}</span>
        {/* 원장님 사정 취소는 정산액 대신 패널티 */}
        {noPayout && item.ownerPenalty ? (
          <span className={cn(AMOUNT_COLUMN, 'font-semibold text-warning-foreground')}>
            패널티 {formatWon(item.ownerPenalty.amount)}
          </span>
        ) : (
          <span className={cn(AMOUNT_COLUMN, 'font-semibold tabular-nums')}>
            {wonOrUnknown(item.payoutAmount)}
          </span>
        )}
        <span className={cn(STATUS_COLUMN, 'text-xs', SETTLEMENT_STATUS_TEXT_STYLE[item.status])}>
          {settlementStatusText(item)}
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      {/* 넓으면 거래·정산 계산·지급 3칸, 좁으면 2칸(지급은 아래 줄) */}
      <div className="grid gap-4 border-t bg-muted/20 px-4 py-4 md:grid-cols-2 xl:grid-cols-3">
        <TradeSection item={item} />
        <CalcSection item={item} />
        <PayoutSection item={item} now={now} />
      </div>
    </details>
  );
}

/** 거래: 서비스 일시, 처리·취소 시각(취소면 시작 몇 시간 전), 메뉴, 정가·할인율·판매가, 쿠폰 사용 */
function TradeSection({ item }: { item: SettlementItemView }) {
  const before = hoursBeforeText(item.hoursBeforeStart);
  return (
    <Section title="거래">
      <Row label="서비스 일시" value={formatKst(new Date(item.startAt))} />
      <Row
        label={OCCURRED_LABELS[item.kind]}
        value={formatKst(new Date(item.occurredAt))}
        note={before}
      />
      <Row label="메뉴" value={item.menuName} wrap />
      <Row label="정가" value={formatWon(item.listPrice)} />
      <Row label="할인율" value={`${item.discountRate}%`} />
      <Row label="판매가" value={formatWon(item.salePrice)} />
      {item.couponUsed ? (
        <p className="text-xs text-muted-foreground">
          쿠폰을 쓴 예약이에요. 쿠폰은 투리가 부담해서 정산 금액과 상관없어요.
        </p>
      ) : null}
    </Section>
  );
}

/** 정산 계산: 기준 금액 식, 수수료와 VAT(기준 금액의 N%), 정산액. 원장님 사정 취소는 기준 금액 0원과 패널티 */
function CalcSection({ item }: { item: SettlementItemView }) {
  if (item.status === 'no_payout') {
    return (
      <Section title="정산 계산">
        <Row label="기준 금액" value={formatWon(item.baseAmount)} note={baseAmountFormula(item)} />
        {item.ownerPenalty ? (
          <>
            <Row label="패널티" value={formatWon(item.ownerPenalty.amount)} strong />
            <p className="text-xs text-muted-foreground">
              {item.ownerPenalty.remaining > 0
                ? `아직 떼지 못한 ${formatWon(item.ownerPenalty.remaining)}은 다음 정산금에서 먼저 떼요.`
                : '정산금에서 모두 뗐어요.'}
            </p>
          </>
        ) : null}
      </Section>
    );
  }
  return (
    <Section title="정산 계산">
      <Row label="기준 금액" value={formatWon(item.baseAmount)} note={baseAmountFormula(item)} />
      <Row
        label={`플랫폼 수수료 (${feeRateLabel(item.platformFeeRate)})`}
        value={minusWon(item.platformFee)}
      />
      <Row label="플랫폼 수수료 VAT" value={minusWon(item.platformFeeVat)} />
      <Row
        label={`결제 수수료 (${feeRateLabel(item.paymentFeeRate)})`}
        value={minusWon(item.paymentFee)}
      />
      <Row label="결제 수수료 VAT" value={minusWon(item.paymentFeeVat)} />
      <div className="border-t pt-2">
        <Row label="정산액" value={wonOrUnknown(item.payoutAmount)} strong />
      </div>
    </Section>
  );
}

/** 지급: 상태(지급일), 이의제기 접수 기한 또는 보류 이유, 예약 상세로 가기 */
function PayoutSection({ item, now }: { item: SettlementItemView; now: Date }) {
  const deadline = disputeDeadlineText(item, now);
  return (
    <Section title="지급">
      <p className={cn('font-medium', SETTLEMENT_STATUS_TEXT_STYLE[item.status])}>
        {settlementStatusText(item)}
      </p>
      {deadline ? <p className="text-muted-foreground">{deadline}</p> : null}
      <div className="pt-1">
        <Button asChild variant="outline" size="sm">
          <Link href={`/owner/reservations/${item.reservationId}`}>예약 상세</Link>
        </Button>
      </div>
    </Section>
  );
}

/** 펼친 줄의 칸 묶음(제목 + 줄들). 정산서 펼치기(statement-list.tsx)도 같이 쓴다 */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 text-sm">
      <h3 className="text-xs font-semibold text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/** 이름 — 값 한 줄. note는 값 아래 흐린 글자(기준 금액 식, 시작 몇 시간 전 등) */
export function Row({
  label,
  value,
  note,
  strong = false,
  wrap = false,
}: {
  label: string;
  value: string;
  note?: string | null;
  strong?: boolean;
  /** 메뉴 이름처럼 긴 글자는 줄을 바꾼다. 금액·시각은 한 줄로 둔다(좁은 폭에서 "− 0원"이 쪼개지지 않게) */
  wrap?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between gap-3">
        {/* 값이 줄을 바꾸는 줄은 이름을 한 줄로 두고, 값이 한 줄인 줄은 긴 이름(수수료 비율)이 줄을 바꾼다 */}
        <span
          className={cn(wrap && 'shrink-0', strong ? 'font-semibold' : 'text-muted-foreground')}
        >
          {label}
        </span>
        <span
          className={cn(
            'min-w-0 text-right tabular-nums',
            wrap ? 'break-keep' : 'whitespace-nowrap',
            strong && 'font-bold',
          )}
        >
          {value}
        </span>
      </div>
      {note ? <p className="text-right text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}
