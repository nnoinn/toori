// 원장님 정산서 (S-501, #129 2장). 금액 기댓값은 docs/settlement-examples.md 3장(오픈 기간) 표 숫자다:
// 이용 완료 43,515원(판매가 45,000원), 고객 취소 30% 13,055원(기준 13,500원), 합의 후 취소 50% 21,758원(기준 22,500원).
// 결제 수수료 3.0%는 문서 가정의 PG 계약 전 임시 숫자라 테스트에만 넣는다. 원장님 귀책 패널티 5,000원은 CLAUDE.md(X-207).
// 지급일은 기술 가이드 7장 "정산 주기" 예시(일요일 15시 → 4일 뒤 목요일 11/19, 수요일 18시 → 8일 뒤 목요일 11/26)다.

import { describe, expect, it } from 'vitest';

import { kstToUtc } from '@/lib/time';

import { type SettledItem, type SettlementRow, toSettlementItemViews } from './settlement-view';
import {
  buildStatementList,
  scheduledStatement,
  scheduledStatements,
  type StoredSettlement,
  storedStatementSummary,
} from './statement-view';

/** 한국 시간 'YYYY-MM-DD HH:MM' → UTC Date */
function kst(value: string): Date {
  const [date, time] = value.split(' ');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return kstToUtc({ year, month, day, hour, minute });
}

const NOW = kst('2026-11-15 18:00');
const DOC_PAYMENT_FEE_RATE = 3.0;

/** 일요일 15시 커트(정가 50,000원, 10% 할인, 판매가 45,000원), 16시에 방문 완료 → 11/19 지급 */
function row(extra: Partial<SettlementRow> = {}): SettlementRow {
  return {
    reservationId: 'visit',
    reservationCode: '100000000001',
    status: 'completed',
    startAt: kst('2026-11-15 15:00'),
    visitResult: 'visited',
    visitRecordedAt: kst('2026-11-15 16:00'),
    cancelledAt: null,
    cancelActor: null,
    cancelPenaltyRate: null,
    hasAdminRefund: false,
    menuName: '커트',
    listPrice: 50_000,
    salePrice: 45_000,
    discountRate: 10,
    couponUsed: false,
    hasOpenDispute: false,
    openDisputeReceivedAt: null,
    ownerPenalty: null,
    item: null,
    ...extra,
  };
}

/** 같은 서비스를 전날 9시에 취소 → 11/19 지급 */
function cancelledRow(
  actor: SettlementRow['cancelActor'],
  penaltyRate: number | null,
  extra: Partial<SettlementRow> = {},
): SettlementRow {
  return row({
    status: 'cancelled',
    visitResult: null,
    visitRecordedAt: null,
    cancelledAt: kst('2026-11-14 09:00'),
    cancelActor: actor,
    cancelPenaltyRate: penaltyRate,
    ...extra,
  });
}

/** 수요일 18시 서비스를 19시에 방문 완료 → 11/26 지급 */
const wednesday = row({
  reservationId: 'wednesday',
  startAt: kst('2026-11-18 18:00'),
  visitRecordedAt: kst('2026-11-18 19:00'),
});

/** 목요일에 묶였고 지급 전인 정산 줄 */
const pendingItem: SettledItem = {
  kind: 'sale',
  baseAmount: 45_000,
  feeRate: 0,
  feeAmount: 0,
  feeVat: 0,
  paymentFeeRate: 3.0,
  paymentFee: 1_350,
  paymentFeeVat: 135,
  payoutAmount: 43_515,
  settlement: { status: 'pending', payoutDate: '2026-11-19' },
};

const views = (rows: SettlementRow[], paymentFeeRate: number | null = DOC_PAYMENT_FEE_RATE) =>
  toSettlementItemViews(rows, { now: NOW, paymentFeeRate });

describe('scheduledStatements: 지급 예정 정산서', () => {
  it('지급 예정 거래를 지급일별로 모아 종류별 건수·기준 금액·수수료 합계·지급액을 계산하고, 이른 지급일부터 준다', () => {
    const statements = scheduledStatements({
      items: views([
        wednesday,
        row(),
        cancelledRow('customer', 30, { reservationId: 'cancel' }),
        cancelledRow('agreed', 50, {
          reservationId: 'agreed',
          cancelledAt: kst('2026-11-15 17:00'),
        }),
      ]),
      lastPayoutDate: '2026-11-12',
      outstandingPenalty: 0,
    });
    expect(statements.map(({ summary }) => summary)).toEqual([
      {
        payoutDate: '2026-11-19',
        periodStart: '2026-11-13',
        periodEnd: '2026-11-19',
        status: 'scheduled',
        counts: { sale: 1, no_show: 0, penalty: 1, agreed_cancel: 1 },
        // 45,000 + 13,500 + 22,500
        baseAmount: 81_000,
        platformFeeTotal: 0,
        // 결제 수수료 + VAT: 1,350 + 135, 405 + 40, 675 + 67
        paymentFeeTotal: 2_672,
        penaltyDeducted: 0,
        // 43,515 + 13,055 + 21,758
        payoutAmount: 78_328,
        zeroReason: null,
        paidAt: null,
      },
      {
        payoutDate: '2026-11-26',
        periodStart: '2026-11-20',
        periodEnd: '2026-11-26',
        status: 'scheduled',
        counts: { sale: 1, no_show: 0, penalty: 0, agreed_cancel: 0 },
        baseAmount: 45_000,
        platformFeeTotal: 0,
        paymentFeeTotal: 1_485,
        penaltyDeducted: 0,
        payoutAmount: 43_515,
        zeroReason: null,
        paidAt: null,
      },
    ]);
    // 거래는 처리·취소가 늦은 것부터
    expect(statements[0].items.map((item) => item.reservationId)).toEqual([
      'agreed',
      'visit',
      'cancel',
    ]);
  });

  it('첫 정산(묶인 정산이 없음)은 처음 거래가 끝난 한국 날짜부터 센다', () => {
    const [first] = scheduledStatements({
      items: views([row(), cancelledRow('customer', 30, { reservationId: 'cancel' })]),
      lastPayoutDate: null,
      outstandingPenalty: 0,
    });
    expect(first.summary).toMatchObject({ periodStart: '2026-11-14', periodEnd: '2026-11-19' });
  });

  it('남은 패널티를 지급일이 이른 장부터 떼고, 0원이 되면 이유를 남기고 나머지는 다음 장에서 뗀다', () => {
    const statements = scheduledStatements({
      items: views([cancelledRow('customer', 30, { reservationId: 'cancel' }), wednesday]),
      lastPayoutDate: '2026-11-12',
      outstandingPenalty: 20_000,
    });
    expect(statements.map(({ summary }) => summary)).toMatchObject([
      // 13,055원을 다 떼서 0원
      {
        payoutDate: '2026-11-19',
        penaltyDeducted: 13_055,
        payoutAmount: 0,
        zeroReason: 'penalty_offset',
      },
      // 남은 6,945원을 떼서 43,515 − 6,945
      { payoutDate: '2026-11-26', penaltyDeducted: 6_945, payoutAmount: 36_570, zeroReason: null },
    ]);
  });

  it('결제 수수료율이 정해지기 전에는 결제 수수료·뗄 패널티·지급액을 비운다', () => {
    const [first] = scheduledStatements({
      items: views([row()], null),
      lastPayoutDate: null,
      outstandingPenalty: 5_000,
    });
    expect(first.summary).toMatchObject({
      baseAmount: 45_000,
      platformFeeTotal: 0,
      paymentFeeTotal: null,
      penaltyDeducted: null,
      payoutAmount: null,
      zeroReason: null,
    });
  });

  it('보류·원장님 사정 취소·이미 묶인 거래는 지급 예정 정산서에 넣지 않는다', () => {
    const statements = scheduledStatements({
      items: views([
        row({ reservationId: 'held', hasOpenDispute: true, openDisputeReceivedAt: NOW }),
        cancelledRow('owner_fault', null, { reservationId: 'owner' }),
        row({ reservationId: 'pending', item: pendingItem }),
      ]),
      lastPayoutDate: null,
      outstandingPenalty: 0,
    });
    expect(statements).toEqual([]);
  });
});

const stored = (extra: Partial<StoredSettlement> = {}): StoredSettlement => ({
  id: 'settlement-1',
  periodStart: '2026-11-06',
  periodEnd: '2026-11-12',
  status: 'paid',
  totalBaseAmount: 45_000,
  penaltyDeducted: 5_000,
  payoutAmount: 38_515,
  paidAt: kst('2026-11-12 11:00'),
  counts: { sale: 1, no_show: 0, penalty: 0, agreed_cancel: 0 },
  platformFeeTotal: 0,
  paymentFeeTotal: 1_485,
  ...extra,
});

describe('storedStatementSummary: 묶인 정산서', () => {
  it('저장한 합계·뗀 패널티·지급액·지급 완료 시각을 그대로 쓴다', () => {
    expect(storedStatementSummary(stored())).toEqual({
      payoutDate: '2026-11-12',
      periodStart: '2026-11-06',
      periodEnd: '2026-11-12',
      status: 'paid',
      counts: { sale: 1, no_show: 0, penalty: 0, agreed_cancel: 0 },
      baseAmount: 45_000,
      platformFeeTotal: 0,
      paymentFeeTotal: 1_485,
      penaltyDeducted: 5_000,
      payoutAmount: 38_515,
      zeroReason: null,
      paidAt: kst('2026-11-12 11:00').toISOString(),
    });
  });

  it('패널티를 떼고 0원이면 이유는 패널티 상계(#353), 거래가 없어 0원이면 이유가 없다', () => {
    expect(
      storedStatementSummary(stored({ penaltyDeducted: 13_055, payoutAmount: 0 })).zeroReason,
    ).toBe('penalty_offset');
    expect(
      storedStatementSummary(stored({ penaltyDeducted: 0, payoutAmount: 0 })).zeroReason,
    ).toBeNull();
  });
});

describe('buildStatementList: 정산서 목록', () => {
  it('기간 안의 묶인 정산서와 지급 예정 정산서를 지급일이 늦은 것부터 놓고, 보류 거래를 따로 모은다', () => {
    const list = buildStatementList({
      stored: [stored()],
      unpaidItems: views([
        row(),
        wednesday,
        row({
          reservationId: 'held',
          hasOpenDispute: true,
          openDisputeReceivedAt: kst('2026-11-16 10:00'),
        }),
        // 보류에도 지급 예정에도 들어가지 않는다
        cancelledRow('owner_fault', null, { reservationId: 'owner' }),
        row({ reservationId: 'pending', item: pendingItem }),
      ]),
      lastPayoutDate: '2026-11-12',
      outstandingPenalty: 0,
      payoutAccount: { bankName: '국민은행', accountLast4: '1234' },
      // 11/26은 기간 밖
      period: { from: '2026-11-01', to: '2026-11-20' },
      now: NOW,
    });
    expect(list.statements.map((statement) => [statement.payoutDate, statement.status])).toEqual([
      ['2026-11-19', 'scheduled'],
      ['2026-11-12', 'paid'],
    ]);
    expect(list.held).toMatchObject({ count: 1, baseAmount: 45_000, payoutAmount: 43_515 });
    expect(list.held.items.map((item) => item.reservationId)).toEqual(['held']);
    expect(list.payoutAccount).toEqual({ bankName: '국민은행', accountLast4: '1234' });
    expect(list.serverNow).toBe(NOW.toISOString());
  });
});

describe('scheduledStatement: 지급 예정 정산서 한 장', () => {
  it('그 지급일의 거래를 펼치고, 뗄 패널티 건은 묶을 때 정해져서 비어 있으며, 없는 날이면 null', () => {
    const input = {
      unpaidItems: views([row(), wednesday]),
      lastPayoutDate: '2026-11-12',
      outstandingPenalty: 5_000,
      payoutAccount: null,
    };
    const statement = scheduledStatement({ ...input, payoutDate: '2026-11-19' });
    expect(statement).toMatchObject({
      payoutDate: '2026-11-19',
      penaltyDeducted: 5_000,
      payoutAmount: 38_515,
      penalties: [],
      payoutAccount: null,
    });
    expect(statement?.items.map((item) => item.reservationId)).toEqual(['visit']);
    expect(scheduledStatement({ ...input, payoutDate: '2026-11-20' })).toBeNull();
  });
});
