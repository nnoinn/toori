// 원장님 정산 내역 문구와 기간 (O15, S-502, 연결 #10·#20, #129). 화면(서버에서 그림)과 테스트가 같이 쓴다.
// 금액·지급 예정일·보류 여부는 강규민님 getSettlementItems 결과를 그대로 쓰고, 여기서는 문구만 만든다(계산하지 않는다).
// 수수료 이름은 "기준 금액의 N%"로 쓴다. 고객 취소·합의 후 취소는 수수료가 판매가가 아니라 기준 금액에 붙기 때문이다(11/14 정민석).
// 결제 수수료율이 정해지기 전(null)에는 매물 등록 가격 미리보기(S-203)처럼 [미정]으로 둔다.

import { formatWon } from '@/lib/format';
import { formatKst, kstDateKey } from '@/lib/time';
import type {
  SettlementItemStatus,
  SettlementItemView,
  SettlementItemViewKind,
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

/** 정산 내역 주소. 달이면 ?month=, 직접 고른 기간이면 ?from=&to= */
export function settlementsHref(period: { month: string } | { from: string; to: string }): string {
  const query =
    'month' in period
      ? new URLSearchParams({ month: period.month })
      : new URLSearchParams({ from: period.from, to: period.to });
  return `/owner/settlements?${query.toString()}`;
}

/** 기간 이름. 예: "11/1(일) ~ 11/30(월)", 해가 다르면 연도를 붙인다 */
export function periodLabel(from: string, to: string): string {
  const start = partsOfKey(from);
  const end = partsOfKey(to);
  if (start.year === end.year) return `${formatDateKey(from)} ~ ${formatDateKey(to)}`;
  return `${start.year}. ${formatDateKey(from)} ~ ${end.year}. ${formatDateKey(to)}`;
}
