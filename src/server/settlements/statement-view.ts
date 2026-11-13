// 원장님 정산서 만들기 (S-501, #129 2장, W20 ③-2). 계산만 한다. DB 읽기는 statement-store.ts·settlement-store.ts.
//
// - 묶인 정산서: 정산 묶음(settlements)에 저장한 합계·뗀 패널티·지급액을 그대로 쓴다
// - 지급 예정 정산서: 아직 묶이지 않은 지급 예정 거래를 지급 예정일별로 모아, 목요일 묶기(W20 ③)와 같은 방식으로 계산한다.
//   기간은 직전 지급일 다음 날부터(첫 정산은 처음 거래가 끝난 한국 날짜부터)이고, 남은 패널티는 지급일이 이른 장부터 뗀다(예상값)
// - 결제 수수료율이 정해지기 전에는 결제 수수료·지급액·뗄 패널티를 비운다(가격 미리보기 S-203과 같다)

import type { SettlementStatus } from '@/db/schema/settlements';
import { kstDateKey, kstToUtc } from '@/lib/time';

import { sumOrNull } from './settlement-view';
import type {
  PayoutAccountView,
  SettlementItemView,
  SettlementStatement,
  SettlementStatementList,
  SettlementStatementSummary,
} from './types';

/** DB에 저장한 정산 묶음과 그 정산 줄 합계(statement-store.ts readShopSettlements) */
export type StoredSettlement = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: SettlementStatus;
  totalBaseAmount: number;
  penaltyDeducted: number;
  payoutAmount: number;
  paidAt: Date | null;
  counts: SettlementStatementSummary['counts'];
  platformFeeTotal: number;
  paymentFeeTotal: number;
};

/** 지급 예정 정산서의 요약과 그 거래 */
export type ScheduledStatement = {
  summary: SettlementStatementSummary;
  items: SettlementItemView[];
};

// 한국은 서머타임이 없어서 하루는 늘 24시간이다
const DAY_MS = 24 * 60 * 60 * 1000;

/** 한국 날짜 'YYYY-MM-DD'의 다음 날 */
function nextDateKey(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const midnight = kstToUtc({ year, month, day, hour: 0, minute: 0 });
  return kstDateKey(new Date(midnight.getTime() + DAY_MS));
}

/** 패널티를 떼고 0원이 된 정산이면 그 이유 */
function zeroReasonOf(
  payoutAmount: number | null,
  penaltyDeducted: number | null,
): SettlementStatementSummary['zeroReason'] {
  return payoutAmount === 0 && penaltyDeducted !== null && penaltyDeducted > 0
    ? 'penalty_offset'
    : null;
}

/** 묶인 정산서 한 장의 요약 */
export function storedStatementSummary(stored: StoredSettlement): SettlementStatementSummary {
  return {
    payoutDate: stored.periodEnd,
    periodStart: stored.periodStart,
    periodEnd: stored.periodEnd,
    status: stored.status,
    counts: stored.counts,
    baseAmount: stored.totalBaseAmount,
    platformFeeTotal: stored.platformFeeTotal,
    paymentFeeTotal: stored.paymentFeeTotal,
    penaltyDeducted: stored.penaltyDeducted,
    payoutAmount: stored.payoutAmount,
    zeroReason: zeroReasonOf(stored.payoutAmount, stored.penaltyDeducted),
    paidAt: stored.paidAt?.toISOString() ?? null,
  };
}

/**
 * 지급 예정 정산서. items는 아직 묶이지 않은 거래 줄이고, 그중 지급 예정(scheduled)만 쓴다.
 * lastPayoutDate는 가장 최근 정산 묶음의 지급일(없으면 null). 지급일이 이른 것부터 돌려준다
 */
export function scheduledStatements(input: {
  items: readonly SettlementItemView[];
  lastPayoutDate: string | null;
  outstandingPenalty: number;
}): ScheduledStatement[] {
  const byDate = new Map<string, SettlementItemView[]>();
  for (const item of input.items) {
    if (item.status !== 'scheduled' || item.payoutDate === null) continue;
    byDate.set(item.payoutDate, [...(byDate.get(item.payoutDate) ?? []), item]);
  }

  let previous = input.lastPayoutDate;
  // 남은 패널티. 앞 장의 지급액을 모르면 뒤 장에서 뗄 금액도 알 수 없어서 null로 둔다
  let remaining: number | null = input.outstandingPenalty;
  return [...byDate.keys()].sort().map((payoutDate) => {
    const items = [...(byDate.get(payoutDate) ?? [])].sort((a, b) =>
      b.occurredAt.localeCompare(a.occurredAt),
    );
    const counts = { sale: 0, no_show: 0, penalty: 0, agreed_cancel: 0 };
    for (const item of items) {
      if (item.kind in counts) counts[item.kind as keyof typeof counts] += 1;
    }
    const payoutBefore = sumOrNull(items.map((item) => item.payoutAmount));
    let penaltyDeducted: number | null = null;
    let payoutAmount: number | null = null;
    if (payoutBefore !== null && remaining !== null) {
      penaltyDeducted = Math.min(remaining, payoutBefore);
      payoutAmount = payoutBefore - penaltyDeducted;
      remaining -= penaltyDeducted;
    } else {
      remaining = null;
    }
    const earliest = items.map((item) => item.occurredAt).sort()[0];
    const periodStart = previous ? nextDateKey(previous) : kstDateKey(new Date(earliest));
    previous = payoutDate;
    const summary: SettlementStatementSummary = {
      payoutDate,
      periodStart,
      periodEnd: payoutDate,
      status: 'scheduled',
      counts,
      baseAmount: items.reduce((total, item) => total + item.baseAmount, 0),
      platformFeeTotal: items.reduce(
        (total, item) => total + item.platformFee + item.platformFeeVat,
        0,
      ),
      paymentFeeTotal: sumOrNull(
        items.map((item) =>
          item.paymentFee === null || item.paymentFeeVat === null
            ? null
            : item.paymentFee + item.paymentFeeVat,
        ),
      ),
      penaltyDeducted,
      payoutAmount,
      zeroReason: zeroReasonOf(payoutAmount, penaltyDeducted),
      paidAt: null,
    };
    return { summary, items };
  });
}

/**
 * 정산서 목록. stored는 지급일이 기간 안인 정산 묶음, unpaidItems는 기간과 상관없이 아직 지급하지 않은 거래 줄
 * (지급 예정 정산서와 보류 거래를 여기서 만든다). period는 지급일 기준 기간(한국 날짜, 둘 다 포함)
 */
export function buildStatementList(input: {
  stored: readonly StoredSettlement[];
  unpaidItems: readonly SettlementItemView[];
  lastPayoutDate: string | null;
  outstandingPenalty: number;
  payoutAccount: PayoutAccountView | null;
  period: { from: string; to: string };
  now: Date;
}): SettlementStatementList {
  const { from, to } = input.period;
  const scheduled = scheduledStatements({
    items: input.unpaidItems,
    lastPayoutDate: input.lastPayoutDate,
    outstandingPenalty: input.outstandingPenalty,
  })
    .map((statement) => statement.summary)
    .filter((summary) => summary.payoutDate >= from && summary.payoutDate <= to);
  const statements = [...input.stored.map(storedStatementSummary), ...scheduled].sort((a, b) =>
    b.payoutDate.localeCompare(a.payoutDate),
  );

  const held = input.unpaidItems.filter((item) => item.status === 'held');
  return {
    statements,
    held: {
      count: held.length,
      baseAmount: held.reduce((total, item) => total + item.baseAmount, 0),
      payoutAmount: sumOrNull(held.map((item) => item.payoutAmount)),
      items: held,
    },
    outstandingPenalty: input.outstandingPenalty,
    payoutAccount: input.payoutAccount,
    serverNow: input.now.toISOString(),
  };
}

/** 묶인 정산서 한 장 펼치기 */
export function storedStatement(input: {
  stored: StoredSettlement;
  items: readonly SettlementItemView[];
  penalties: readonly { reservationCode: string; amount: number }[];
  payoutAccount: PayoutAccountView | null;
}): SettlementStatement {
  return {
    ...storedStatementSummary(input.stored),
    items: [...input.items],
    penalties: [...input.penalties],
    payoutAccount: input.payoutAccount,
  };
}

/** 지급 예정 정산서 한 장 펼치기. 그 지급일에 지급 예정 거래가 없으면 null */
export function scheduledStatement(input: {
  payoutDate: string;
  unpaidItems: readonly SettlementItemView[];
  lastPayoutDate: string | null;
  outstandingPenalty: number;
  payoutAccount: PayoutAccountView | null;
}): SettlementStatement | null {
  const found = scheduledStatements({
    items: input.unpaidItems,
    lastPayoutDate: input.lastPayoutDate,
    outstandingPenalty: input.outstandingPenalty,
  }).find((statement) => statement.summary.payoutDate === input.payoutDate);
  if (!found) return null;
  // 뗄 패널티 건은 목요일에 묶을 때 정해진다
  return {
    ...found.summary,
    items: found.items,
    penalties: [],
    payoutAccount: input.payoutAccount,
  };
}
