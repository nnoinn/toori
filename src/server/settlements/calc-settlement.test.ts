// 정산 계산 (X-205, 연결 #10, #15 W8). docs/settlement-examples.md 3장(오픈 기간)·4장(법인 전환 뒤) 표 숫자를 기댓값으로 그대로 쓴다.
// 문서 가정(결제 수수료 3.0%, 실제 PG 수수료 카드 결제액의 3.0% + VAT)은 PG 계약 전 임시 숫자라 테스트에만 넣는다.

import { describe, expect, it } from 'vitest';

import {
  allocatePenalties,
  calcSettlementFees,
  calcTuriShare,
  settlementBaseAmount,
} from './calc-settlement';

const PAYMENT_FEE_RATE = 3.0;

/** 문서 가정: 실제 PG 수수료 = 카드에 남은 돈의 3.0%, 그 VAT 10%(원 미만 버림) */
function pgFeeOf(cardAmount: number) {
  const pgFee = Math.floor((cardAmount * 3) / 100);
  return { pgFee, pgFeeVat: Math.floor(pgFee / 10) };
}

type Row = {
  name: string;
  mode: 'launch' | 'tiered';
  discountRate: number;
  salePrice: number;
  paidAmount: number;
  refundAmount: number;
  penaltyRate?: number;
  /** 문서 표의 숫자 */
  expected: {
    pgHeld: number;
    feeAmount: number;
    feeVat: number;
    paymentFee: number;
    paymentFeeVat: number;
    payoutAmount: number;
    turiRemaining: number;
    turiProfit: number;
  };
};

const sale = (
  mode: Row['mode'],
  discountRate: number,
  coupon: number,
  expected: Row['expected'],
): Row => {
  const salePrice = discountRate === 10 ? 45_000 : 25_000;
  return {
    name: `${mode === 'launch' ? '3장' : '4장'} ${discountRate}% 할인, 쿠폰 ${coupon}원`,
    mode,
    discountRate,
    salePrice,
    paidAmount: salePrice - coupon,
    refundAmount: 0,
    expected,
  };
};

const cancel = (
  mode: Row['mode'],
  coupon: number,
  refundAmount: number,
  expected: Row['expected'],
): Row => ({
  name: `${mode === 'launch' ? '3장' : '4장'} 30시간 전 취소(위약금 30%, 10% 할인), 쿠폰 ${coupon}원`,
  mode,
  discountRate: 10,
  salePrice: 45_000,
  paidAmount: 45_000 - coupon,
  refundAmount,
  penaltyRate: 30,
  expected,
});

const ROWS: Row[] = [
  // 3장 오픈 기간(플랫폼 수수료 0%)
  sale('launch', 10, 0, {
    pgHeld: 43_515,
    feeAmount: 0,
    feeVat: 0,
    paymentFee: 1_350,
    paymentFeeVat: 135,
    payoutAmount: 43_515,
    turiRemaining: 0,
    turiProfit: 0,
  }),
  sale('launch', 10, 3_000, {
    pgHeld: 40_614,
    feeAmount: 0,
    feeVat: 0,
    paymentFee: 1_350,
    paymentFeeVat: 135,
    payoutAmount: 43_515,
    turiRemaining: -2_901,
    turiProfit: -2_910,
  }),
  sale('launch', 50, 0, {
    pgHeld: 24_175,
    feeAmount: 0,
    feeVat: 0,
    paymentFee: 750,
    paymentFeeVat: 75,
    payoutAmount: 24_175,
    turiRemaining: 0,
    turiProfit: 0,
  }),
  sale('launch', 50, 3_000, {
    pgHeld: 21_274,
    feeAmount: 0,
    feeVat: 0,
    paymentFee: 750,
    paymentFeeVat: 75,
    payoutAmount: 24_175,
    turiRemaining: -2_901,
    turiProfit: -2_910,
  }),
  cancel('launch', 0, 31_500, {
    pgHeld: 13_055,
    feeAmount: 0,
    feeVat: 0,
    paymentFee: 405,
    paymentFeeVat: 40,
    payoutAmount: 13_055,
    turiRemaining: 0,
    turiProfit: 0,
  }),
  cancel('launch', 3_000, 29_400, {
    pgHeld: 12_185,
    feeAmount: 0,
    feeVat: 0,
    paymentFee: 405,
    paymentFeeVat: 40,
    payoutAmount: 13_055,
    turiRemaining: -870,
    turiProfit: -873,
  }),
  // 4장 법인 전환 뒤(할인율별 플랫폼 수수료)
  sale('tiered', 10, 0, {
    pgHeld: 43_515,
    feeAmount: 4_500,
    feeVat: 450,
    paymentFee: 1_350,
    paymentFeeVat: 135,
    payoutAmount: 38_565,
    turiRemaining: 4_950,
    turiProfit: 4_500,
  }),
  sale('tiered', 10, 3_000, {
    pgHeld: 40_614,
    feeAmount: 4_500,
    feeVat: 450,
    paymentFee: 1_350,
    paymentFeeVat: 135,
    payoutAmount: 38_565,
    turiRemaining: 2_049,
    turiProfit: 1_590,
  }),
  sale('tiered', 50, 0, {
    pgHeld: 24_175,
    feeAmount: 1_500,
    feeVat: 150,
    paymentFee: 750,
    paymentFeeVat: 75,
    payoutAmount: 22_525,
    turiRemaining: 1_650,
    turiProfit: 1_500,
  }),
  sale('tiered', 50, 3_000, {
    pgHeld: 21_274,
    feeAmount: 1_500,
    feeVat: 150,
    paymentFee: 750,
    paymentFeeVat: 75,
    payoutAmount: 22_525,
    turiRemaining: -1_251,
    turiProfit: -1_410,
  }),
  cancel('tiered', 0, 31_500, {
    pgHeld: 13_055,
    feeAmount: 1_350,
    feeVat: 135,
    paymentFee: 405,
    paymentFeeVat: 40,
    payoutAmount: 11_570,
    turiRemaining: 1_485,
    turiProfit: 1_350,
  }),
  cancel('tiered', 3_000, 29_400, {
    pgHeld: 12_185,
    feeAmount: 1_350,
    feeVat: 135,
    paymentFee: 405,
    paymentFeeVat: 40,
    payoutAmount: 11_570,
    turiRemaining: 615,
    turiProfit: 477,
  }),
];

describe('settlement-examples.md 표 숫자', () => {
  it.each(ROWS)('$name', (row) => {
    const baseAmount = settlementBaseAmount(
      row.penaltyRate === undefined
        ? { kind: 'sale', salePrice: row.salePrice }
        : { kind: 'penalty', salePrice: row.salePrice, penaltyRate: row.penaltyRate },
    );
    const fees = calcSettlementFees({
      baseAmount,
      discountRate: row.discountRate,
      paymentFeeRate: PAYMENT_FEE_RATE,
      mode: row.mode,
    });
    const share = calcTuriShare({
      fees,
      paidAmount: row.paidAmount,
      refundAmount: row.refundAmount,
      ...pgFeeOf(row.paidAmount - row.refundAmount),
    });

    expect({
      pgHeld: share.pgHeld,
      feeAmount: fees.feeAmount,
      feeVat: fees.feeVat,
      paymentFee: fees.paymentFee,
      paymentFeeVat: fees.paymentFeeVat,
      payoutAmount: fees.payoutAmount,
      turiRemaining: share.turiRemaining,
      turiProfit: share.turiProfit,
    }).toEqual(row.expected);
  });

  it('원장님 정산은 쿠폰과 상관없이 같다(판매가 기준)', () => {
    for (const mode of ['launch', 'tiered'] as const) {
      const [withoutCoupon, withCoupon] = ROWS.filter(
        (row) => row.mode === mode && row.discountRate === 10 && row.penaltyRate === undefined,
      );
      expect(withCoupon.expected.payoutAmount).toBe(withoutCoupon.expected.payoutAmount);
    }
  });
});

describe('settlementBaseAmount: 기준 금액', () => {
  it('이용 완료·노쇼는 판매가', () => {
    expect(settlementBaseAmount({ kind: 'sale', salePrice: 23_450 })).toBe(23_450);
    expect(settlementBaseAmount({ kind: 'no_show', salePrice: 23_450 })).toBe(23_450);
  });

  it('고객 취소는 판매가 × 위약금 비율, 원 미만 버림(환불 계산의 원장님 기준 금액과 같다)', () => {
    expect(settlementBaseAmount({ kind: 'penalty', salePrice: 45_000, penaltyRate: 30 })).toBe(
      13_500,
    );
    expect(settlementBaseAmount({ kind: 'penalty', salePrice: 23_457, penaltyRate: 30 })).toBe(
      7_037,
    );
    expect(settlementBaseAmount({ kind: 'penalty', salePrice: 23_450, penaltyRate: 100 })).toBe(
      23_450,
    );
  });

  it.each([
    ['판매가가 소수', { kind: 'sale', salePrice: 100.5 }],
    ['판매가 0', { kind: 'sale', salePrice: 0 }],
    ['위약금 비율 없음', { kind: 'penalty', salePrice: 10_000 }],
    ['위약금 비율 100 초과', { kind: 'penalty', salePrice: 10_000, penaltyRate: 101 }],
  ] as const)('%s → 에러', (_, input) => {
    expect(() => settlementBaseAmount(input as never)).toThrow(RangeError);
  });
});

describe('calcSettlementFees: 수수료·정산액', () => {
  it('노쇼는 이용 완료와 같은 계산(판매가 기준, 위약금 100%)', () => {
    const base = settlementBaseAmount({ kind: 'no_show', salePrice: 45_000 });
    expect(
      calcSettlementFees({ baseAmount: base, discountRate: 10, paymentFeeRate: 3, mode: 'launch' })
        .payoutAmount,
    ).toBe(43_515);
  });

  it('결과 칸은 settlement_items와 같은 이름이고 적용한 비율도 남긴다', () => {
    expect(
      calcSettlementFees({
        baseAmount: 45_000,
        discountRate: 10,
        paymentFeeRate: 3,
        mode: 'tiered',
      }),
    ).toEqual({
      baseAmount: 45_000,
      feeRate: 10,
      feeAmount: 4_500,
      feeVat: 450,
      paymentFeeRate: 3,
      paymentFee: 1_350,
      paymentFeeVat: 135,
      payoutAmount: 38_565,
    });
  });

  it('소수 비율도 오차 없이 원 미만만 버린다(그냥 곱하면 30,000 × 4.35%가 1,304가 된다)', () => {
    const at = (baseAmount: number, paymentFeeRate: number) =>
      calcSettlementFees({ baseAmount, discountRate: 10, paymentFeeRate, mode: 'launch' })
        .paymentFee;
    expect(at(30_000, 4.35)).toBe(1_305);
    expect(at(50_000, 2.55)).toBe(1_275);
    expect(at(25_000, 4.1)).toBe(1_025);
    expect(at(13_500, 3.3)).toBe(445);
    expect(at(33_333, 2.55)).toBe(849);
  });

  it('결제 수수료율이 정해지지 않았으면(null) 정산을 확정할 수 없어 에러', () => {
    expect(() =>
      calcSettlementFees({ baseAmount: 45_000, discountRate: 10, paymentFeeRate: null }),
    ).toThrow();
  });

  it.each([
    ['소수 셋째 자리 비율', { paymentFeeRate: 2.955 }],
    ['음수 비율', { paymentFeeRate: -1 }],
    ['선택지에 없는 할인율', { discountRate: 15 }],
    ['기준 금액이 소수', { baseAmount: 100.5 }],
  ])('%s → 에러', (_, change) => {
    expect(() =>
      calcSettlementFees({
        baseAmount: 45_000,
        discountRate: 10,
        paymentFeeRate: 3,
        mode: 'tiered',
        ...change,
      }),
    ).toThrow(RangeError);
  });
});

describe('allocatePenalties: 원장님 귀책 패널티 떼기', () => {
  const penalty = (id: string, day: number, amount = 5_000, collectedAmount = 0) => ({
    penaltyId: id,
    amount,
    collectedAmount,
    createdAt: new Date(`2026-11-0${day}T00:00:00Z`),
  });

  it('정산액이 충분하면 모두 떼고 남은 패널티는 없다', () => {
    expect(allocatePenalties(30_000, [penalty('p1', 1), penalty('p2', 2)])).toEqual({
      collections: [
        { penaltyId: 'p1', amount: 5_000 },
        { penaltyId: 'p2', amount: 5_000 },
      ],
      payoutAfter: 20_000,
      outstanding: [],
    });
  });

  it('모자라면 오래된 것부터 떼고, 남은 금액은 다음 정산으로 넘긴다', () => {
    expect(allocatePenalties(7_000, [penalty('p2', 2), penalty('p1', 1)])).toEqual({
      collections: [
        { penaltyId: 'p1', amount: 5_000 },
        { penaltyId: 'p2', amount: 2_000 },
      ],
      payoutAfter: 0,
      outstanding: [{ penaltyId: 'p2', remainingAmount: 3_000 }],
    });
  });

  it('이미 일부 걷은 패널티는 남은 금액만 뗀다', () => {
    expect(allocatePenalties(10_000, [penalty('p1', 1, 5_000, 3_000)])).toEqual({
      collections: [{ penaltyId: 'p1', amount: 2_000 }],
      payoutAfter: 8_000,
      outstanding: [],
    });
  });

  it('정산액이 0원이면 아무것도 떼지 않는다', () => {
    expect(allocatePenalties(0, [penalty('p1', 1)])).toEqual({
      collections: [],
      payoutAfter: 0,
      outstanding: [{ penaltyId: 'p1', remainingAmount: 5_000 }],
    });
  });

  it('걷은 금액이 패널티보다 크거나 금액이 소수면 에러', () => {
    expect(() => allocatePenalties(10_000, [penalty('p1', 1, 5_000, 6_000)])).toThrow(RangeError);
    expect(() => allocatePenalties(100.5, [])).toThrow(RangeError);
  });
});
