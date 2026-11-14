// 원장님 정산 내역 문구와 기간 (O15, S-501 정산서·S-502 거래별 상세, 연결 #10·#20, #129). 화면(서버에서 그림)과 테스트가 같이 쓴다.
// 금액·지급 예정일·보류 여부는 강규민님 getSettlementItems·getSettlementStatements 결과를 그대로 쓰고,
// 여기서는 문구만 만든다(계산하지 않는다).
// 수수료 이름은 "기준 금액의 N%"로 쓴다. 고객 취소·합의 후 취소는 수수료가 판매가가 아니라 기준 금액에 붙기 때문이다(11/14 정민석).
// 결제 수수료율이 정해지기 전(null)에는 매물 등록 가격 미리보기(S-203)처럼 [미정]으로 둔다.

import { formatWon } from '@/lib/format';
import { formatKst, kstDateKey } from '@/lib/time';
import type {
  PayoutAccountView,
  SettlementItemStatus,
  SettlementItemView,
  SettlementItemViewKind,
  SettlementStatementStatus,
  SettlementStatementSummary,
} from '@/server/settlements/types';

import { WEEKDAY_LABELS } from '../settings/shop/shop-profile';
import { addDaysToKey, partsOfKey, weekdayOfKey } from '../slots/calendar-days';

/** 금액이나 비율이 아직 정해지지 않았을 때(결제 수수료율 PG 계약 전). 가격 미리보기(S-203)와 같은 글자 */
export const UNKNOWN_LABEL = '[미정]';

/** 결제 수수료율이 비어 있을 때 붙이는 안내. 가격 미리보기(S-203)와 같은 문구 */
export const UNKNOWN_FEE_NOTE = '결제 수수료율은 결제 대행사 계약 뒤 정해져요.';

/** 거래 종류 이름. 예약 상세(S-403)의 취소 이름과 맞춘다 */
export const SETTLEMENT_KIND_LABELS: Record<SettlementItemViewKind, string> = {
  sale: '이용 완료',
  no_show: '노쇼',
  penalty: '고객 취소',
  agreed_cancel: '합의 후 취소',
  owner_cancel: '원장님 사정 취소',
  void: '무효',
};

/** 펼친 줄의 "언제 처리했는지" 칸 이름 */
export const OCCURRED_LABELS: Record<SettlementItemViewKind, string> = {
  sale: '방문 완료 처리',
  no_show: '노쇼 처리',
  penalty: '고객이 취소한 시각',
  agreed_cancel: '합의 후 취소된 시각',
  owner_cancel: '취소한 시각',
  void: '무효 처리',
};

/** 금액. 아직 정해지지 않았으면(null) [미정] */
export function wonOrUnknown(amount: number | null): string {
  return amount === null ? UNKNOWN_LABEL : formatWon(amount);
}

/** 뺄 금액. 예: "− 405원", 정해지지 않았으면 [미정] */
export function minusWon(amount: number | null): string {
  return amount === null ? UNKNOWN_LABEL : `− ${formatWon(amount)}`;
}

/** 수수료 이름 뒤 비율. 예: "기준 금액의 3%", 정해지지 않았으면 "기준 금액의 [미정]" */
export function feeRateLabel(rate: number | null): string {
  return `기준 금액의 ${rate === null ? UNKNOWN_LABEL : `${rate}%`}`;
}

/** 한국 날짜 'YYYY-MM-DD' → "11/19(목)". 지급일처럼 시각이 없는 날짜에 쓴다 */
export function formatDateKey(key: string): string {
  const { month, day } = partsOfKey(key);
  return `${month}/${day}(${WEEKDAY_LABELS[weekdayOfKey(key)]})`;
}

/**
 * 기준 금액이 어떻게 나왔는지 식으로(#129 정민석 11/13).
 * 고객 취소·합의 후 취소: "판매가 45,000원 × 30% = 13,500원", 이용 완료·노쇼: "판매가 45,000원 그대로",
 * 원장님 사정 취소·무효: 0원인 이유. 비율과 금액은 함수 값 그대로 쓴다
 */
export function baseAmountFormula(
  item: Pick<SettlementItemView, 'kind' | 'salePrice' | 'penaltyRate' | 'baseAmount'>,
): string {
  switch (item.kind) {
    case 'sale':
    case 'no_show':
      return `판매가 ${formatWon(item.salePrice)} 그대로`;
    case 'penalty':
    case 'agreed_cancel':
      return item.penaltyRate === null
        ? formatWon(item.baseAmount)
        : `판매가 ${formatWon(item.salePrice)} × ${item.penaltyRate}% = ${formatWon(item.baseAmount)}`;
    case 'owner_cancel':
      return '원장님 사정 취소는 정산할 금액이 없어요';
    case 'void':
      return '무효 처리된 예약은 정산할 금액이 없어요';
  }
}

/** 서비스 시작 몇 시간 전에 취소했는지. 예: "시작 30시간 전". 값이 없는 종류면 null */
export function hoursBeforeText(hoursBeforeStart: number | null): string | null {
  if (hoursBeforeStart === null) return null;
  return hoursBeforeStart === 0 ? '시작 1시간 이내' : `시작 ${hoursBeforeStart}시간 전`;
}

/** 줄의 상태 문구. 지급일은 함수가 준 payoutDate 그대로. 예: "11/19(목) 지급 예정", "이의제기로 보류" */
export function settlementStatusText(
  item: Pick<SettlementItemView, 'status' | 'payoutDate'>,
): string {
  const date = item.payoutDate ? `${formatDateKey(item.payoutDate)} ` : '';
  const texts: Record<SettlementItemStatus, string> = {
    scheduled: `${date}지급 예정`,
    held: '이의제기로 보류',
    pending: `${date}지급 준비 중`,
    requested: `${date}지급 요청함`,
    paid: `${date}지급 완료`,
    failed: '지급 실패 · 다시 요청 예정',
    no_payout: '정산할 금액 없음',
  };
  return texts[item.status];
}

/**
 * 이의제기 접수 기한 안내. 보류 중이면 접수한 날과 다음 지급일 안내, 기한이 남았으면 "…까지 이의제기가 없으면 확정돼요",
 * 지났으면 "…에 확정됐어요". 정산할 금액이 없는 줄은 확정할 것이 없어 null
 */
export function disputeDeadlineText(
  item: Pick<SettlementItemView, 'status' | 'disputeDeadlineAt' | 'hold'>,
  now: Date,
): string | null {
  if (item.status === 'no_payout') return null;
  if (item.hold) {
    const received = formatDateKey(kstDateKey(new Date(item.hold.receivedAt)));
    return `이의제기 확인 중이에요(${received} 접수). 결론이 나면 그다음 지급일에 들어가요.`;
  }
  const deadline = new Date(item.disputeDeadlineAt);
  return deadline.getTime() > now.getTime()
    ? `${formatKst(deadline)}까지 이의제기가 없으면 확정돼요.`
    : `${formatKst(deadline)}에 확정됐어요.`;
}

// ── 정산서 (S-501) ────────────────────────────────────────────────────

/** 정산서 상태 이름. 지급일은 옆 칸에 따로 쓴다. 지급 실패 이유와 다시 요청하는 날은 PG 지급 요청을 만들 때 칸이 생긴다 */
export const STATEMENT_STATUS_LABELS: Record<SettlementStatementStatus, string> = {
  scheduled: '지급 예정',
  pending: '지급 준비 중',
  requested: '지급 요청함',
  paid: '지급 완료',
  failed: '지급 실패 · 다시 요청 예정',
};

/** 아직 묶지 않은 지급 예정 정산서의 패널티에 붙이는 표시(11/14 nnoinn) */
export const EXPECTED_MARK = '(예상)';

/** 지급 예정 정산서의 뗄 패널티가 왜 "예상"인지 */
export const EXPECTED_PENALTY_NOTE =
  '지금 남은 패널티로 계산한 금액이에요. 지급일 전에 원장님 사정 취소가 생기면 달라질 수 있어요.';

/** 이의제기로 보류 중인 거래 안내(#129 2장) */
export const HELD_NOTE = '결론이 나면 그다음 지급일에 들어가요.';

/** 0원인 이유(zeroReason 코드)의 문구. #353 4번 */
export const ZERO_REASON_LABELS: Record<
  NonNullable<SettlementStatementSummary['zeroReason']>,
  string
> = {
  penalty_offset: '패널티로 상계해서 0원',
};

// 정산서 건수를 보여주는 순서. 거래 내역의 종류 이름과 같다
const STATEMENT_COUNT_KINDS = ['sale', 'no_show', 'penalty', 'agreed_cancel'] as const;

/** 종류별 건수. 0건인 종류는 뺀다. 예: "이용 완료 2건 · 고객 취소 1건" */
export function statementCountsText(counts: SettlementStatementSummary['counts']): string {
  const parts = STATEMENT_COUNT_KINDS.filter((kind) => counts[kind] > 0).map(
    (kind) => `${SETTLEMENT_KIND_LABELS[kind]} ${counts[kind]}건`,
  );
  return parts.length > 0 ? parts.join(' · ') : '거래 없음';
}

/** 정산서의 거래 수(종류별 건수를 모두 더한 것) */
export function statementTotalCount(counts: SettlementStatementSummary['counts']): number {
  return STATEMENT_COUNT_KINDS.reduce((total, kind) => total + counts[kind], 0);
}

/** 패널티 칸 이름. 지급 예정 장은 "뗄 패널티 (예상)", 묶인 장은 "뗀 패널티" */
export function statementPenaltyLabel(status: SettlementStatementStatus): string {
  return status === 'scheduled' ? `뗄 패널티 ${EXPECTED_MARK}` : '뗀 패널티';
}

/** 0원이면 이유. 지급 예정 장은 패널티가 예상값이라 "(예상)"을 붙인다. 0원이 아니면 null */
export function zeroReasonText(
  summary: Pick<SettlementStatementSummary, 'status' | 'zeroReason'>,
): string | null {
  if (summary.zeroReason === null) return null;
  const label = ZERO_REASON_LABELS[summary.zeroReason];
  return summary.status === 'scheduled' ? `${label} ${EXPECTED_MARK}` : label;
}

/**
 * 접힌 정산서 줄의 실지급액 아래 한 줄. 0원이면 그 이유, 패널티를 뗐으면 그 금액
 * (예: "패널티 5,000원 뗄 예정 (예상)", "패널티 5,000원 뗐어요"). 둘 다 아니거나 아직 모르면(null) null
 */
export function statementAmountNote(
  summary: Pick<SettlementStatementSummary, 'status' | 'zeroReason' | 'penaltyDeducted'>,
): string | null {
  const zero = zeroReasonText(summary);
  if (zero) return zero;
  if (summary.penaltyDeducted === null || summary.penaltyDeducted === 0) return null;
  const amount = formatWon(summary.penaltyDeducted);
  return summary.status === 'scheduled'
    ? `패널티 ${amount} 뗄 예정 ${EXPECTED_MARK}`
    : `패널티 ${amount} 뗐어요`;
}

/** 정산 계좌. 은행 이름과 끝 4자리만. 예: "국민은행 ****1234" */
export function payoutAccountText(account: PayoutAccountView): string {
  return `${account.bankName} ****${account.accountLast4}`;
}

// ── 기간 ──────────────────────────────────────────────────────────────

/** 볼 기간. month: 한 달(◀ ▶로 옮김), range: 시작일·끝일을 직접 고름(최대 1년은 서버가 본다) */
export type SettlementPeriod =
  | { kind: 'month'; month: string; from: string; to: string }
  | { kind: 'range'; from: string; to: string };

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 달 'YYYY-MM'의 첫날과 마지막 날. 예: '2028-02' → 2028-02-01 ~ 2028-02-29 */
export function monthRange(month: string): { from: string; to: string } {
  const from = `${month}-01`;
  const to = addDaysToKey(`${shiftMonth(month, 1)}-01`, -1);
  return { from, to };
}

/** 달을 앞뒤로. 예: ('2026-12', 1) → '2027-01' */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const index = year * 12 + (monthNumber - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** 달 이름. 예: "2026년 11월" */
export function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${year}년 ${monthNumber}월`;
}

/** 지금(서버 시각)이 속한 한국 달 'YYYY-MM' */
export function currentMonth(now: Date): string {
  return kstDateKey(now).slice(0, 7);
}

/**
 * 주소 값으로 볼 기간을 정한다. 시작일·끝일이 둘 다 날짜 모양이면 그 기간(맞는 기간인지는 서버가 보고 틀리면 안내),
 * 아니면 month 값의 달, month도 없거나 틀리면 이번 달(한국 날짜)
 */
export function resolveSettlementPeriod(
  params: { month?: string; from?: string; to?: string },
  now: Date,
): SettlementPeriod {
  if (params.from && params.to && DATE_PATTERN.test(params.from) && DATE_PATTERN.test(params.to)) {
    return { kind: 'range', from: params.from, to: params.to };
  }
  const month = params.month && MONTH_PATTERN.test(params.month) ? params.month : currentMonth(now);
  return { kind: 'month', month, ...monthRange(month) };
}

/**
 * 정산서를 찾을 지급일 기간. 이번 달을 볼 때는 다음 달 말일까지 넓힌다. 월말에는 다음 지급일이 다음 달 목요일이라
 * 이번 달만 찾으면 다음 지급 예정 장이 안 보이기 때문이다(지급 예정 장은 앞으로 2주 안쪽이라 다음 달 말일이면 넉넉하다).
 * 지난 달과 직접 고른 기간은 그대로
 */
export function statementQueryPeriod(
  period: SettlementPeriod,
  thisMonth: string,
): { from: string; to: string } {
  if (period.kind === 'month' && period.month === thisMonth) {
    return { from: period.from, to: monthRange(shiftMonth(thisMonth, 1)).to };
  }
  return { from: period.from, to: period.to };
}

// ── 탭과 주소 ─────────────────────────────────────────────────────────

/** 정산 내역 화면의 탭. statements: 정산서(지급일 기준, 처음 열면 이 탭), items: 거래 내역(처리·취소일 기준, S-502) */
export type SettlementView = 'statements' | 'items';

export const SETTLEMENT_VIEW_LABELS: Record<SettlementView, string> = {
  statements: '정산서',
  items: '거래 내역',
};

/** 탭마다 기간을 찾는 날짜. 두 탭의 기준이 달라서 기간 옆에 적는다 */
export const PERIOD_BASIS_LABELS: Record<SettlementView, string> = {
  statements: '지급일로 찾아요',
  items: '방문·노쇼 처리일이나 취소일로 찾아요',
};

/** 주소의 view 값. items가 아니면 정산서 */
export function resolveSettlementView(value: string | undefined): SettlementView {
  return value === 'items' ? 'items' : 'statements';
}

/** 주소에 넣을 기간 값. 달이면 { month }, 직접 고른 기간이면 { from, to } */
export function periodHrefValue(
  period: SettlementPeriod,
): { month: string } | { from: string; to: string } {
  return period.kind === 'month' ? { month: period.month } : { from: period.from, to: period.to };
}

/**
 * 정산 내역 주소. 달이면 ?month=, 직접 고른 기간이면 ?from=&to=.
 * 거래 내역 탭이면 view=items, 펼친 정산서가 있으면 payout=지급일
 */
export function settlementsHref(
  period: { month: string } | { from: string; to: string },
  options: { view?: SettlementView; payout?: string | null } = {},
): string {
  const query = new URLSearchParams();
  if (options.view === 'items') query.set('view', 'items');
  if ('month' in period) {
    query.set('month', period.month);
  } else {
    query.set('from', period.from);
    query.set('to', period.to);
  }
  if (options.payout) query.set('payout', options.payout);
  return `/owner/settlements?${query.toString()}`;
}

/** 기간 이름. 예: "11/1(일) ~ 11/30(월)", 해가 다르면 연도를 붙인다 */
export function periodLabel(from: string, to: string): string {
  const start = partsOfKey(from);
  const end = partsOfKey(to);
  if (start.year === end.year) return `${formatDateKey(from)} ~ ${formatDateKey(to)}`;
  return `${start.year}. ${formatDateKey(from)} ~ ${end.year}. ${formatDateKey(to)}`;
}
