// 환불 계산 (X-202, 연결 #9, #15 W7). 경계값과 docs/settlement-examples.md 3장의 취소 예시를 기댓값으로 쓴다.

import { describe, expect, it } from 'vitest';

import { REFUND_BANDS_DB } from '@/db/schema/refunds';
import { REFUND_BANDS } from '@/server/policy';

import { calcRefund, getPenaltyBand } from './calc-refund';

const START = new Date('2026-11-01T06:00:00Z'); // 한국 시간 11/1 15:00
const HOUR = 60 * 60 * 1000;
const before = (ms: number) => new Date(START.getTime() - ms);

describe('getPenaltyBand: 남은 시간 구간', () => {
  it.each([
    ['48시간 넘게 남음', 50 * HOUR, 'over_24h', 30],
    ['딱 24시간 남음', 24 * HOUR, 'over_24h', 30],
    ['24시간에서 1ms 모자람', 24 * HOUR - 1, '6h_to_24h', 50],
    ['딱 6시간 남음', 6 * HOUR, '6h_to_24h', 50],
    ['6시간에서 1ms 모자람', 6 * HOUR - 1, 'under_6h', 100],
    ['시작 시각', 0, 'under_6h', 100],
    ['시작 뒤', -2 * HOUR, 'under_6h', 100],
  ] as const)('%s → %s %i%%', (_, msLeft, band, penaltyRate) => {
    expect(getPenaltyBand(START, before(msLeft))).toEqual({ band, penaltyRate });
  });

  it('정책값의 구간마다 DB 구간 이름이 있고, 순서대로 하나씩 맞는다', () => {
    expect(
      REFUND_BANDS.map((b) => getPenaltyBand(START, before(b.minHoursLeft * HOUR)).band),
    ).toEqual([...REFUND_BANDS_DB]);
  });
});

describe('calcRefund: 고객 취소', () => {
  it('정산 예시 3장: 45,000원 결제, 30시간 전 취소 → 70% 환불, 원장님 기준 30%', () => {
    expect(
      calcRefund({ paidAmount: 45_000, salePrice: 45_000, startAt: START, now: before(30 * HOUR) }),
    ).toEqual({
      band: 'over_24h',
      penaltyRate: 30,
      refundAmount: 31_500,
      penaltyAmount: 13_500,
      ownerBaseAmount: 13_500,
      refundable: true,
    });
  });

  it('정산 예시 3장: 쿠폰 3,000원을 쓴 결제(42,000원)는 결제액 기준 환불, 원장님 기준은 판매가 그대로', () => {
    expect(
      calcRefund({ paidAmount: 42_000, salePrice: 45_000, startAt: START, now: before(30 * HOUR) }),
    ).toMatchObject({ refundAmount: 29_400, penaltyAmount: 12_600, ownerBaseAmount: 13_500 });
  });

  it('6~24시간 전이면 50%', () => {
    expect(
      calcRefund({ paidAmount: 23_450, salePrice: 23_450, startAt: START, now: before(10 * HOUR) }),
    ).toMatchObject({ band: '6h_to_24h', refundAmount: 11_725, ownerBaseAmount: 11_725 });
  });

  it('6시간 미만이나 시작 뒤면 환불 없음(취소 화면은 버튼 대신 안내)', () => {
    for (const now of [before(HOUR), before(-HOUR)]) {
      expect(calcRefund({ paidAmount: 23_450, salePrice: 23_450, startAt: START, now })).toEqual({
        band: 'under_6h',
        penaltyRate: 100,
        refundAmount: 0,
        penaltyAmount: 23_450,
        ownerBaseAmount: 23_450,
        refundable: false,
      });
    }
  });

  it('원 미만이 생기면 위약금을 버려서 고객 환불이 표시한 비율보다 적어지지 않는다', () => {
    // 23,457 × 30% = 7,037.1 → 위약금 7,037, 환불 16,420(= 70%인 16,419.9보다 많음)
    expect(
      calcRefund({ paidAmount: 23_457, salePrice: 23_457, startAt: START, now: before(30 * HOUR) }),
    ).toMatchObject({ penaltyAmount: 7_037, refundAmount: 16_420, ownerBaseAmount: 7_037 });
  });

  it('쿠폰으로 결제액이 0원이어도 계산된다', () => {
    expect(
      calcRefund({ paidAmount: 0, salePrice: 3_000, startAt: START, now: before(30 * HOUR) }),
    ).toMatchObject({ refundAmount: 0, penaltyAmount: 0, ownerBaseAmount: 900, refundable: false });
  });
});

describe('calcRefund: 원장님 귀책 취소', () => {
  it('남은 시간과 상관없이 결제액 전액 환불, 원장님 기준 금액 0, 구간 없음', () => {
    for (const now of [before(30 * HOUR), before(HOUR)]) {
      expect(
        calcRefund({
          paidAmount: 42_000,
          salePrice: 45_000,
          startAt: START,
          now,
          reason: 'owner_fault',
        }),
      ).toEqual({
        band: null,
        penaltyRate: 0,
        refundAmount: 42_000,
        penaltyAmount: 0,
        ownerBaseAmount: 0,
        refundable: true,
      });
    }
  });
});

describe('calcRefund: 잘못된 금액', () => {
  it.each([
    ['결제액이 음수', { paidAmount: -1, salePrice: 1_000 }],
    ['결제액이 소수', { paidAmount: 100.5, salePrice: 1_000 }],
    ['판매가가 0', { paidAmount: 0, salePrice: 0 }],
    ['결제액이 판매가보다 큼', { paidAmount: 2_000, salePrice: 1_000 }],
  ])('%s → 에러', (_, amounts) => {
    expect(() => calcRefund({ ...amounts, startAt: START, now: before(30 * HOUR) })).toThrow(
      RangeError,
    );
  });
});
