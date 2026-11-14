// 원장님 정산 내역 한 줄과 합계 만들기 (S-501·S-502, #129). 계산만 한다. DB 읽기는 settlement-store.ts.
//
// - 아직 묶지 않은 거래는 정산 규칙(settle-rules.ts)으로 종류·기준 금액·지급 예정일을 그때그때 계산한다
// - 목요일에 묶인 거래(settlement_items)는 저장한 금액과 정산 묶음 상태를 그대로 쓴다
// - 결제 수수료율이 정해지기 전(null)에는 가격 미리보기(S-203)처럼 결제 수수료와 정산액을 비운다
// - 원장님 사정 취소는 정산 줄이 없어도 기준 금액 0원과 패널티로 남긴다(정산할 금액 없음, #129 nnoinn 요청)

import { z } from 'zod';

import type { SettlementItemKind, SettlementStatus } from '@/db/schema/settlements';
import { hoursUntil, kstToUtc } from '@/lib/time';
import { disputeDeadline } from '@/server/disputes/rules';

import { calcSettlementFees, settlementBaseAmount } from './calc-settlement';
import { type SettleTarget, settlementKindOf, settlementSchedule } from './settle-rules';
import type { SettlementItemStatus, SettlementItemView, SettlementList } from './types';

/** 목요일에 묶인 정산 줄(settlement_items)과 그 정산 묶음 */
export type SettledItem = {
  kind: SettlementItemKind;
  baseAmount: number;
  feeRate: number;
  feeAmount: number;
  feeVat: number;
  paymentFeeRate: number;
  paymentFee: number;
  paymentFeeVat: number;
  payoutAmount: number;
  /** 정산 묶음의 상태와 지급일(period_end). 묶음이 없으면 null */
  settlement: { status: SettlementStatus; payoutDate: string } | null;
};

/** 정산 내역 한 줄을 만들 예약 값 */
export type SettlementRow = SettleTarget & {
  reservationId: string;
  reservationCode: string;
  menuName: string;
  listPrice: number;
  salePrice: number;
  discountRate: number;
  /** 쿠폰을 쓴 주문인지 */
  couponUsed: boolean;
  hasOpenDispute: boolean;
  /** 확인 중 이의제기를 받은 시각. 없으면 null */
  openDisputeReceivedAt: Date | null;
  /** 원장님 귀책 취소 패널티(그 예약 것). 없으면 null */
  ownerPenalty: { amount: number; collectedAmount: number } | null;
  /** 이미 묶였으면 그 정산 줄 */
  item: SettledItem | null;
};

type Options = { now: Date; paymentFeeRate: number | null };

/**
 * 예약 하나의 정산 내역 줄. 예정 예약과, 원장님 사정 취소가 아닌데 정산할 거래가 아닌 것
 * (운영자 취소, 자동 취소, 환불이 끝나지 않은 취소)은 null
 */
export function toSettlementItemView(
  row: SettlementRow,
  { now, paymentFeeRate }: Options,
): SettlementItemView | null {
  const occurredAt = row.status === 'completed' ? row.visitRecordedAt : row.cancelledAt;
  const deadline = disputeDeadline(row);
  if (row.status === 'confirmed' || !occurredAt || !deadline) return null;
  const common = {
    reservationId: row.reservationId,
    reservationCode: row.reservationCode,
    startAt: row.startAt.toISOString(),
    menuName: row.menuName,
    occurredAt: occurredAt.toISOString(),
    listPrice: row.listPrice,
    discountRate: row.discountRate,
    salePrice: row.salePrice,
    couponUsed: row.couponUsed,
    disputeDeadlineAt: deadline.toISOString(),
  };

  if (row.status === 'cancelled' && row.cancelActor === 'owner_fault') {
    const penalty = row.ownerPenalty;
    return {
      ...common,
      kind: 'owner_cancel',
      penaltyRate: null,
      hoursBeforeStart: wholeHoursBefore(row.startAt, occurredAt),
      baseAmount: 0,
      platformFeeRate: 0,
      platformFee: 0,
      platformFeeVat: 0,
      paymentFeeRate: null,
      paymentFee: 0,
      paymentFeeVat: 0,
      payoutAmount: 0,
      ownerPenalty: penalty
        ? { amount: penalty.amount, remaining: penalty.amount - penalty.collectedAmount }
        : null,
      hold: null,
      status: 'no_payout',
      payoutDate: null,
    };
  }

  if (row.item) {
    const { item } = row;
    return {
      ...common,
      kind: item.kind,
      penaltyRate: ratedKind(item.kind) ? row.cancelPenaltyRate : null,
      hoursBeforeStart: item.kind === 'penalty' ? wholeHoursBefore(row.startAt, occurredAt) : null,
      baseAmount: item.baseAmount,
      platformFeeRate: item.feeRate,
      platformFee: item.feeAmount,
      platformFeeVat: item.feeVat,
      paymentFeeRate: item.paymentFeeRate,
      paymentFee: item.paymentFee,
      paymentFeeVat: item.paymentFeeVat,
      payoutAmount: item.payoutAmount,
      ownerPenalty: null,
      // 묶인 거래는 이의제기 접수 기한이 지나 보류가 없다
      hold: null,
      // 줄은 묶음과 한 트랜잭션에서 만든다. 묶음이 없으면 지급 전으로 본다
      status: item.settlement?.status ?? 'pending',
      payoutDate: item.settlement?.payoutDate ?? null,
    };
  }

  const settle = settlementKindOf(row);
  if (!settle) return null;
  const baseAmount = settlementBaseAmount({ ...settle, salePrice: row.salePrice });
  // 결제 수수료율을 모르면 플랫폼 수수료만 계산한다(0%를 넣어 계산하고 결제 수수료 칸은 비운다, preview.ts와 같다)
  const fees = calcSettlementFees({
    baseAmount,
    discountRate: row.discountRate,
    paymentFeeRate: paymentFeeRate ?? 0,
  });
  const known = paymentFeeRate !== null;
  const schedule = settlementSchedule(row, { hasOpenDispute: row.hasOpenDispute, now });
  return {
    ...common,
    kind: settle.kind,
    penaltyRate: 'penaltyRate' in settle ? settle.penaltyRate : null,
    hoursBeforeStart: settle.kind === 'penalty' ? wholeHoursBefore(row.startAt, occurredAt) : null,
    baseAmount,
    platformFeeRate: fees.feeRate,
    platformFee: fees.feeAmount,
    platformFeeVat: fees.feeVat,
    paymentFeeRate: known ? fees.paymentFeeRate : null,
    paymentFee: known ? fees.paymentFee : null,
    paymentFeeVat: known ? fees.paymentFeeVat : null,
    payoutAmount: known ? fees.payoutAmount : null,
    ownerPenalty: null,
    hold:
      schedule.status === 'held' && row.openDisputeReceivedAt
        ? { reason: 'dispute', receivedAt: row.openDisputeReceivedAt.toISOString() }
        : null,
    status: schedule.status,
    payoutDate: schedule.status === 'scheduled' ? schedule.payoutDate : null,
  };
}

function ratedKind(kind: SettlementItemKind): boolean {
  return kind === 'penalty' || kind === 'agreed_cancel';
}

/** 서비스 시작 몇 시간 전에 취소했는지(시간 단위, 버림). 위약금 구간과 같은 셈이라 23시간 59분 전은 23이다 */
function wholeHoursBefore(startAt: Date, cancelledAt: Date): number {
  return Math.max(0, Math.floor(hoursUntil(startAt, cancelledAt)));
}

/** 합계. 하나라도 null이면 null */
export function sumOrNull(values: readonly (number | null)[]): number | null {
  let total = 0;
  for (const value of values) {
    if (value === null) return null;
    total += value;
  }
  return total;
}

/** 예약들의 정산 내역 줄. 정산 내역에 없는 예약은 빼고, 처리·취소가 늦은 것부터 */
export function toSettlementItemViews(
  rows: readonly SettlementRow[],
  options: Options,
): SettlementItemView[] {
  return rows
    .map((row) => toSettlementItemView(row, options))
    .filter((item) => item !== null)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

/** 다음에 지급될 상태: 지급 예정, 지급 전, 지급 요청 */
const UPCOMING: ReadonlySet<SettlementItemStatus> = new Set(['scheduled', 'pending', 'requested']);

/**
 * 정산 내역 결과. rows는 기간 안의 예약, unpaidRows는 기간과 상관없이 아직 지급하지 않은 예약(다음 지급 묶음 계산용)
 */
export function buildSettlementList(input: {
  rows: readonly SettlementRow[];
  unpaidRows: readonly SettlementRow[];
  outstandingPenalty: number;
  now: Date;
  paymentFeeRate: number | null;
}): SettlementList {
  const options = { now: input.now, paymentFeeRate: input.paymentFeeRate };
  const items = toSettlementItemViews(input.rows, options);

  const upcoming = input.unpaidRows
    .map((row) => toSettlementItemView(row, options))
    .filter((item) => item !== null)
    .filter((item) => UPCOMING.has(item.status) && item.payoutDate !== null);
  const nextDate = upcoming.map((item) => item.payoutDate as string).sort()[0];
  const next = upcoming.filter((item) => item.payoutDate === nextDate);

  // 정산할 금액이 없는 줄(원장님 사정 취소)은 내역에만 보이고 합계에는 넣지 않는다
  const payable = items.filter((item) => item.status !== 'no_payout');
  return {
    items,
    summary: {
      count: payable.length,
      baseAmount: payable.reduce((total, item) => total + item.baseAmount, 0),
      feeAmount: sumOrNull(
        payable.map((item) =>
          item.paymentFee === null || item.paymentFeeVat === null
            ? null
            : item.platformFee + item.platformFeeVat + item.paymentFee + item.paymentFeeVat,
        ),
      ),
      payoutAmount: sumOrNull(payable.map((item) => item.payoutAmount)),
      heldCount: payable.filter((item) => item.status === 'held').length,
    },
    nextPayout: nextDate
      ? {
          date: nextDate,
          count: next.length,
          payoutAmount: sumOrNull(next.map((item) => item.payoutAmount)),
        }
      : null,
    outstandingPenalty: input.outstandingPenalty,
    serverNow: input.now.toISOString(),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** 정산 내역을 한 번에 볼 수 있는 가장 긴 기간(일) */
export const SETTLEMENT_PERIOD_MAX_DAYS = 366;
const dateSchema = z.iso.date();

/** 한국 날짜 'YYYY-MM-DD'의 0시 */
function kstDayStart(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return kstToUtc({ year, month, day, hour: 0, minute: 0 });
}

/**
 * 화면이 고른 기간(한국 날짜, 시작일·끝일 포함) → [시작일 0시, 끝일 다음 날 0시).
 * 날짜 모양이 틀렸거나, 시작일이 끝일보다 늦거나, 366일보다 길면 null
 */
export function parseSettlementPeriod(from: unknown, to: unknown): { from: Date; to: Date } | null {
  const start = dateSchema.safeParse(from);
  const end = dateSchema.safeParse(to);
  if (!start.success || !end.success) return null;
  const period = {
    from: kstDayStart(start.data),
    to: new Date(kstDayStart(end.data).getTime() + DAY_MS),
  };
  const days = (period.to.getTime() - period.from.getTime()) / DAY_MS;
  if (days < 1 || days > SETTLEMENT_PERIOD_MAX_DAYS) return null;
  return period;
}
