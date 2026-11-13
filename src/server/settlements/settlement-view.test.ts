// 원장님 정산 내역 한 줄과 합계 (S-501·S-502, #129). 금액 기댓값은 docs/settlement-examples.md 3장(오픈 기간) 표 숫자다.
// 문서 가정의 결제 수수료 3.0%는 PG 계약 전 임시 숫자라 테스트에만 넣는다(정책값은 아직 null).
// 지급일은 기술 가이드 7장 "정산 주기" 예시(일요일 15시 서비스 → 4일 뒤 목요일)를 쓴다.
// 이의제기 접수 기한은 기술 가이드 7장 "이의제기"(영업일 기준 48시간, 토·일 제외): 일요일 처리 → 월요일 0시부터 48시간 → 수요일 0시.

import { describe, expect, it } from 'vitest';

import { kstToUtc } from '@/lib/time';

import {
  buildSettlementList,
  parseSettlementPeriod,
  type SettledItem,
  type SettlementRow,
  toSettlementItemView,
} from './settlement-view';

/** 한국 시간 'YYYY-MM-DD HH:MM' → UTC Date */
function kst(value: string): Date {
  const [date, time] = value.split(' ');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return kstToUtc({ year, month, day, hour, minute });
}

const NOW = kst('2026-11-15 18:00');
const DOC_PAYMENT_FEE_RATE = 3.0;

/** 일요일 15시 커트 서비스(정가 50,000원, 10% 할인, 판매가 45,000원), 16시에 방문 완료 처리 */
function row(extra: Partial<SettlementRow> = {}): SettlementRow {
  return {
    reservationId: 'reservation-1',
    reservationCode: '123456789012',
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

/** 서비스 전날 9시(시작 30시간 전)에 취소한 예약 */
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

const settled = (extra: Partial<SettledItem> = {}): SettledItem => ({
  kind: 'sale',
  baseAmount: 45_000,
  feeRate: 0,
  feeAmount: 0,
  feeVat: 0,
  paymentFeeRate: 3.0,
  paymentFee: 1_350,
  paymentFeeVat: 135,
  payoutAmount: 43_515,
  settlement: { status: 'paid', payoutDate: '2026-11-19' },
  ...extra,
});

describe('toSettlementItemView: 아직 묶지 않은 거래', () => {
  it('결제 수수료율이 정해지기 전에는 기준 금액·플랫폼 수수료만 주고 결제 수수료와 정산액은 비운다', () => {
    expect(toSettlementItemView(row(), { now: NOW, paymentFeeRate: null })).toEqual({
      reservationId: 'reservation-1',
      reservationCode: '123456789012',
      kind: 'sale',
      startAt: kst('2026-11-15 15:00').toISOString(),
      menuName: '커트',
      occurredAt: kst('2026-11-15 16:00').toISOString(),
      listPrice: 50_000,
      discountRate: 10,
      salePrice: 45_000,
      penaltyRate: null,
      hoursBeforeStart: null,
      baseAmount: 45_000,
      platformFeeRate: 0,
      platformFee: 0,
      platformFeeVat: 0,
      paymentFeeRate: null,
      paymentFee: null,
      paymentFeeVat: null,
      payoutAmount: null,
      couponUsed: false,
      ownerPenalty: null,
      disputeDeadlineAt: kst('2026-11-18 00:00').toISOString(),
      hold: null,
      status: 'scheduled',
      payoutDate: '2026-11-19',
    });
  });

  it.each([
    ['이용 완료', row(), 'sale', null, 45_000, 43_515],
    ['노쇼', row({ visitResult: 'no_show' }), 'no_show', null, 45_000, 43_515],
    ['고객 취소(위약금 30%)', cancelledRow('customer', 30), 'penalty', 30, 13_500, 13_055],
    ['합의 후 취소(판매가 × 50%)', cancelledRow('agreed', 50), 'agreed_cancel', 50, 22_500, 21_758],
  ] as const)('정산 예시 3장: %s', (_, target, kind, penaltyRate, baseAmount, payoutAmount) => {
    expect(
      toSettlementItemView(target, { now: NOW, paymentFeeRate: DOC_PAYMENT_FEE_RATE }),
    ).toMatchObject({ kind, penaltyRate, baseAmount, payoutAmount, status: 'scheduled' });
  });

  it('이의제기 중이면 보류이고 지급일이 없으며, 보류 이유로 이의제기를 받은 시각을 준다', () => {
    const received = kst('2026-11-16 10:00');
    expect(
      toSettlementItemView(row({ hasOpenDispute: true, openDisputeReceivedAt: received }), {
        now: NOW,
        paymentFeeRate: null,
      }),
    ).toMatchObject({
      status: 'held',
      payoutDate: null,
      hold: { reason: 'dispute', receivedAt: received.toISOString() },
    });
  });

  it('고객 취소는 시작 몇 시간 전에 취소했는지 시간 단위로 버려서 주고, 합의 후 취소는 주지 않는다', () => {
    const options = { now: NOW, paymentFeeRate: null };
    // 11/14 09:00 취소 → 11/15 15:00 시작의 30시간 전
    expect(toSettlementItemView(cancelledRow('customer', 30), options)).toMatchObject({
      hoursBeforeStart: 30,
    });
    // 23시간 59분 전은 23(위약금 50% 구간과 같은 셈)
    const late = cancelledRow('customer', 50, { cancelledAt: kst('2026-11-14 15:01') });
    expect(toSettlementItemView(late, options)).toMatchObject({ hoursBeforeStart: 23 });
    expect(toSettlementItemView(cancelledRow('agreed', 50), options)).toMatchObject({
      hoursBeforeStart: null,
    });
  });

  it('쿠폰을 쓴 예약은 쿠폰 사용만 알리고 금액은 판매가 기준 그대로다', () => {
    expect(
      toSettlementItemView(row({ couponUsed: true }), {
        now: NOW,
        paymentFeeRate: DOC_PAYMENT_FEE_RATE,
      }),
    ).toMatchObject({ couponUsed: true, baseAmount: 45_000, payoutAmount: 43_515 });
  });

  it.each([
    ['예정 예약', row({ status: 'confirmed', visitResult: null, visitRecordedAt: null })],
    ['운영자 취소 환불이 있는 이용 완료', row({ hasAdminRefund: true })],
    ['환불이 끝나지 않은 고객 취소', cancelledRow('customer', null)],
  ])('%s는 정산 내역에 없다', (_, target) => {
    expect(toSettlementItemView(target, { now: NOW, paymentFeeRate: null })).toBeNull();
  });
});

describe('toSettlementItemView: 원장님 사정 취소', () => {
  it('정산 줄이 없어도 기준 금액 0원·정산할 금액 없음으로 남기고, 패널티와 아직 못 뗀 금액을 준다', () => {
    const view = toSettlementItemView(
      cancelledRow('owner_fault', null, {
        ownerPenalty: { amount: 5_000, collectedAmount: 2_000 },
      }),
      { now: NOW, paymentFeeRate: DOC_PAYMENT_FEE_RATE },
    );
    expect(view).toMatchObject({
      kind: 'owner_cancel',
      penaltyRate: null,
      hoursBeforeStart: 30,
      baseAmount: 0,
      platformFee: 0,
      paymentFee: 0,
      payoutAmount: 0,
      ownerPenalty: { amount: 5_000, remaining: 3_000 },
      hold: null,
      status: 'no_payout',
      payoutDate: null,
    });
  });
});

describe('toSettlementItemView: 목요일에 묶인 거래', () => {
  it('저장한 금액과 묶음의 상태·지급일을 그대로 쓴다(지금 계산과 달라도)', () => {
    const view = toSettlementItemView(
      row({ item: settled({ paymentFeeRate: 2.5, paymentFee: 1_125, paymentFeeVat: 112 }) }),
      { now: NOW, paymentFeeRate: null },
    );
    expect(view).toMatchObject({
      kind: 'sale',
      paymentFeeRate: 2.5,
      paymentFee: 1_125,
      paymentFeeVat: 112,
      payoutAmount: 43_515,
      status: 'paid',
      payoutDate: '2026-11-19',
    });
  });

  it('묶인 고객 취소는 환불 기록의 위약금 비율을 같이 보여준다', () => {
    const view = toSettlementItemView(
      cancelledRow('customer', 30, { item: settled({ kind: 'penalty', baseAmount: 13_500 }) }),
      { now: NOW, paymentFeeRate: null },
    );
    expect(view).toMatchObject({
      kind: 'penalty',
      penaltyRate: 30,
      hoursBeforeStart: 30,
      baseAmount: 13_500,
      hold: null,
    });
  });

  it('묶음이 없으면 지급 전이고 지급일이 없다', () => {
    const view = toSettlementItemView(row({ item: settled({ settlement: null }) }), {
      now: NOW,
      paymentFeeRate: null,
    });
    expect(view).toMatchObject({ status: 'pending', payoutDate: null });
  });
});

describe('buildSettlementList: 합계와 다음 지급', () => {
  it('처리·취소가 늦은 것부터 놓고, 합계는 정산할 금액이 있는 거래만 세고, 보류 건수를 센다', () => {
    const list = buildSettlementList({
      rows: [
        cancelledRow('customer', 30, { reservationId: 'cancel' }),
        row({ reservationId: 'visit', hasOpenDispute: true }),
        cancelledRow('owner_fault', null, {
          reservationId: 'owner-fault',
          cancelledAt: kst('2026-11-13 09:00'),
          ownerPenalty: { amount: 5_000, collectedAmount: 0 },
        }),
      ],
      unpaidRows: [],
      outstandingPenalty: 5_000,
      now: NOW,
      paymentFeeRate: DOC_PAYMENT_FEE_RATE,
    });
    // 원장님 사정 취소는 내역에는 남고 합계에는 들어가지 않는다
    expect(list.items.map((item) => item.reservationId)).toEqual([
      'visit',
      'cancel',
      'owner-fault',
    ]);
    expect(list.summary).toEqual({
      count: 2,
      baseAmount: 58_500,
      // 결제 수수료 1,350 + 135(이용 완료), 405 + 40(고객 취소)
      feeAmount: 1_930,
      payoutAmount: 56_570,
      heldCount: 1,
    });
    expect(list.outstandingPenalty).toBe(5_000);
    expect(list.serverNow).toBe(NOW.toISOString());
  });

  it('결제 수수료율을 모르는 거래가 있으면 수수료·정산액 합계는 비운다', () => {
    const list = buildSettlementList({
      rows: [row({ item: settled() }), row({ reservationId: 'later' })],
      unpaidRows: [],
      outstandingPenalty: 0,
      now: NOW,
      paymentFeeRate: null,
    });
    expect(list.summary).toMatchObject({ count: 2, baseAmount: 90_000, feeAmount: null });
    expect(list.summary.payoutAmount).toBeNull();
  });

  it('다음 지급은 기간과 상관없이 가장 이른 지급일의 거래를 묶고, 보류·지급 실패는 뺀다', () => {
    const list = buildSettlementList({
      rows: [],
      unpaidRows: [
        // 수요일 18시 서비스 → 다음 주 목요일(11/26)
        row({
          reservationId: 'later',
          startAt: kst('2026-11-18 18:00'),
          visitRecordedAt: kst('2026-11-18 19:00'),
        }),
        row({ reservationId: 'this-week' }),
        row({
          reservationId: 'requested',
          item: settled({ settlement: { status: 'requested', payoutDate: '2026-11-19' } }),
        }),
        row({ reservationId: 'held', hasOpenDispute: true }),
        row({
          reservationId: 'failed',
          item: settled({ settlement: { status: 'failed', payoutDate: '2026-11-12' } }),
        }),
      ],
      outstandingPenalty: 0,
      now: NOW,
      paymentFeeRate: DOC_PAYMENT_FEE_RATE,
    });
    expect(list.nextPayout).toEqual({ date: '2026-11-19', count: 2, payoutAmount: 87_030 });
  });

  it('지급할 거래가 없으면 다음 지급은 null', () => {
    const list = buildSettlementList({
      rows: [],
      unpaidRows: [row({ hasOpenDispute: true })],
      outstandingPenalty: 0,
      now: NOW,
      paymentFeeRate: null,
    });
    expect(list.nextPayout).toBeNull();
  });
});

describe('parseSettlementPeriod: 기간', () => {
  it('한국 날짜 시작일 0시부터 끝일 다음 날 0시 전까지', () => {
    expect(parseSettlementPeriod('2026-11-01', '2026-11-30')).toEqual({
      from: kst('2026-11-01 00:00'),
      to: kst('2026-12-01 00:00'),
    });
    expect(parseSettlementPeriod('2026-11-15', '2026-11-15')).toEqual({
      from: kst('2026-11-15 00:00'),
      to: kst('2026-11-16 00:00'),
    });
  });

  it('366일까지 받고 그보다 길면 막는다', () => {
    expect(parseSettlementPeriod('2026-01-01', '2027-01-01')).not.toBeNull();
    expect(parseSettlementPeriod('2026-01-01', '2027-01-02')).toBeNull();
  });

  it.each([
    ['시작일이 끝일보다 늦음', '2026-11-30', '2026-11-01'],
    ['날짜 모양이 틀림', '2026/11/01', '2026-11-30'],
    ['없는 날짜', '2026-02-30', '2026-03-01'],
    ['비어 있음', undefined, '2026-11-30'],
  ])('%s → null', (_, from, to) => {
    expect(parseSettlementPeriod(from, to)).toBeNull();
  });
});
