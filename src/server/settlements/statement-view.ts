// 원장님 정산서 만들기 (S-501, #129 2장, W20 ③-2). 계산만 한다. DB 읽기는 statement-store.ts·settlement-store.ts.
//
// - 묶인 정산서: 정산 묶음(settlements)에 저장한 합계·뗀 패널티·지급액을 그대로 쓴다
// - 지급 예정 정산서: 아직 묶이지 않은 지급 예정 거래를 지급 예정일별로 모아, 목요일 묶기(W20 ③)와 같은 방식으로 계산한다.
//   기간은 직전 지급일 다음 날부터(첫 정산은 처음 거래가 끝난 한국 날짜부터)이고, 남은 패널티는 지급일이 이른 장부터
//   묶기와 같은 함수(allocatePenalties)로 오래된 것부터 뗀다. 그래서 예상값과 실제로 떼는 값이 같은 순서로 나온다(#129 리뷰)
// - 결제 수수료율이 정해지기 전에는 결제 수수료·지급액·뗄 패널티를 비운다(가격 미리보기 S-203과 같다)

import type { SettlementStatus } from '@/db/schema/settlements';
import { kstDateKey, kstToUtc } from '@/lib/time';

import { allocatePenalties, type OutstandingPenalty } from './calc-settlement';
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

/** 아직 다 걷지 못한 원장님 귀책 패널티와 그 원인 예약번호(statement-store.ts readUnpaidPenalties) */
export type UnpaidPenalty = OutstandingPenalty & { reservationCode: string };

/** 지급 예정 정산서의 요약, 그 거래, 뗄 패널티 건별(예상) */
export type ScheduledStatement = {
  summary: SettlementStatementSummary;
  items: SettlementItemView[];
  penalties: { reservationCode: string; amount: number }[];
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
  penalties: readonly UnpaidPenalty[];
}): ScheduledStatement[] {
  const byDate = new Map<string, SettlementItemView[]>();
  for (const item of input.items) {
    if (item.status !== 'scheduled' || item.payoutDate === null) continue;
    byDate.set(item.payoutDate, [...(byDate.get(item.payoutDate) ?? []), item]);
  }

  const codeOf = new Map(
    input.penalties.map((penalty) => [penalty.penaltyId, penalty.reservationCode]),
  );
  let previous = input.lastPayoutDate;
  // 남은 패널티. 앞 장의 지급액을 모르면 뒤 장에서 뗄 금액도 알 수 없어서 null로 둔다
  let remaining: OutstandingPenalty[] | null = [...input.penalties];
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
    let penalties: ScheduledStatement['penalties'] = [];
    if (payoutBefore !== null && remaining !== null) {
      const allocated = allocatePenalties(payoutBefore, remaining);
      penaltyDeducted = allocated.collections.reduce((total, taken) => total + taken.amount, 0);
      payoutAmount = allocated.payoutAfter;
      penalties = allocated.collections.map((taken) => ({
        reservationCode: codeOf.get(taken.penaltyId) ?? '',
        amount: taken.amount,
      }));
      // 이번 장에서 뗀 만큼 걷은 것으로 보고 다음 장으로 넘긴다
      const taken = new Map(allocated.collections.map((c) => [c.penaltyId, c.amount]));
      remaining = remaining
        .map((penalty) => ({
          ...penalty,
          collectedAmount: penalty.collectedAmount + (taken.get(penalty.penaltyId) ?? 0),
        }))
        .filter((penalty) => penalty.collectedAmount < penalty.amount);
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
    return { summary, items, penalties };
  });
}

/** 아직 다 걷지 못한 패널티 합계 */
function outstandingOf(penalties: readonly UnpaidPenalty[]): number {
  return penalties.reduce((total, penalty) => total + penalty.amount - penalty.collectedAmount, 0);
}

/**
 * 정산서 목록. stored는 지급일이 기간 안인 정산 묶음, unpaidItems는 기간과 상관없이 아직 지급하지 않은 거래 줄
 * (지급 예정 정산서와 보류 거래를 여기서 만든다). period는 지급일 기준 기간(한국 날짜, 둘 다 포함)
 */
export function buildStatementList(input: {
  stored: readonly StoredSettlement[];
  unpaidItems: readonly SettlementItemView[];
  lastPayoutDate: string | null;
  penalties: readonly UnpaidPenalty[];
  payoutAccount: PayoutAccountView | null;
  period: { from: string; to: string };
  now: Date;
}): SettlementStatementList {
  const { from, to } = input.period;
  const scheduled = scheduledStatements({
    items: input.unpaidItems,
    lastPayoutDate: input.lastPayoutDate,
    penalties: input.penalties,
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
    outstandingPenalty: outstandingOf(input.penalties),
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

/** 지급 예정 정산서 한 장 펼치기. 뗄 패널티 건별은 지금 남은 패널티로 계산한 예상값이다. 그 지급일에 지급 예정 거래가 없으면 null */
export function scheduledStatement(input: {
  payoutDate: string;
  unpaidItems: readonly SettlementItemView[];
  lastPayoutDate: string | null;
  penalties: readonly UnpaidPenalty[];
  payoutAccount: PayoutAccountView | null;
}): SettlementStatement | null {
  const found = scheduledStatements({
    items: input.unpaidItems,
    lastPayoutDate: input.lastPayoutDate,
    penalties: input.penalties,
  }).find((statement) => statement.summary.payoutDate === input.payoutDate);
  if (!found) return null;
  return {
    ...found.summary,
    items: found.items,
    penalties: found.penalties,
    payoutAccount: input.payoutAccount,
  };
}
