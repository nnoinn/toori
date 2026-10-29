// 원장님 매물 등록 가격 미리보기 (S-203, 연결 #10, #129). 오픈 기간·결제 수수료율 미정(지금)과 정해진 뒤를 본다.

import { describe, expect, it } from 'vitest';

import { previewSettlement } from './preview';

describe('previewSettlement', () => {
  it('지금(오픈 기간, 결제 수수료율 미정): 플랫폼 수수료 0, 결제 수수료와 정산 예정액은 null', () => {
    expect(previewSettlement({ listPrice: 50_000, discountRate: 10 })).toEqual({
      salePrice: 45_000,
      platformFeeRate: 0,
      platformFee: 0,
      platformFeeVat: 0,
      paymentFeeRate: null,
      paymentFee: null,
      paymentFeeVat: null,
      payoutAmount: null,
    });
  });

  it('결제 수수료율이 정해지면 정산 예정액까지(settlement-examples.md 3장 10% 할인)', () => {
    expect(
      previewSettlement({ listPrice: 50_000, discountRate: 10 }, { paymentFeeRate: 3 }),
    ).toEqual({
      salePrice: 45_000,
      platformFeeRate: 0,
      platformFee: 0,
      platformFeeVat: 0,
      paymentFeeRate: 3,
      paymentFee: 1_350,
      paymentFeeVat: 135,
      payoutAmount: 43_515,
    });
  });

  it('법인 전환 뒤(할인율별 수수료) 50% 할인: settlement-examples.md 4장', () => {
    expect(
      previewSettlement(
        { listPrice: 50_000, discountRate: 50 },
        { paymentFeeRate: 3, mode: 'tiered' },
      ),
    ).toMatchObject({
      salePrice: 25_000,
      platformFeeRate: 6,
      platformFee: 1_500,
      payoutAmount: 22_525,
    });
  });

  it('할인가는 100원 단위로 올리지 않는다(33,500원·30% → 23,450원)', () => {
    expect(previewSettlement({ listPrice: 33_500, discountRate: 30 }).salePrice).toBe(23_450);
  });

  it.each([
    ['선택지에 없는 할인율', { listPrice: 50_000, discountRate: 15 }],
    ['정가 0', { listPrice: 0, discountRate: 10 }],
    ['정가가 소수', { listPrice: 100.5, discountRate: 10 }],
  ])('%s → 에러', (_, input) => {
    expect(() => previewSettlement(input)).toThrow(RangeError);
  });
});
