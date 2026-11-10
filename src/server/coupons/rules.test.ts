// 쿠폰 규칙 (#300, 11/10 결정). 쓸 수 없는 이유, 최소 결제 금액, 정렬과 기본 쿠폰을 본다.

import { describe, expect, it } from 'vitest';

import { MIN_PAYMENT_AMOUNT } from '@/server/policy/owner-fault';

import {
  arrangeCoupons,
  arrangeCouponsForSlot,
  couponBlockReason,
  type CouponRow,
  isCouponApplicable,
} from './rules';

const NOW = new Date('2026-11-11T03:00:00.000Z');
const day = (days: number) => new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);

function coupon(id: string, amount: number, expiresInDays: number): CouponRow {
  return { couponId: id, amount, expiresAt: day(expiresInDays), usedOrderId: null };
}

describe('isCouponApplicable (Q3)', () => {
  it('쿠폰을 뺀 금액이 최소 결제 금액 이상이어야 한다', () => {
    expect(MIN_PAYMENT_AMOUNT).toBe(200);
    expect(isCouponApplicable(3000, 3200)).toBe(true);
    expect(isCouponApplicable(3000, 3199)).toBe(false);
    expect(isCouponApplicable(3000, 3000)).toBe(false);
  });
});

describe('couponBlockReason', () => {
  const salePrice = 23_450;

  it('쓸 수 있으면 null', () => {
    expect(couponBlockReason(coupon('c', 3000, 30), { now: NOW, salePrice })).toBeNull();
  });

  it('내 쿠폰이 아니면 NOT_FOUND, 쓴 쿠폰은 USED(기한이 지났어도), 기한 시각부터 EXPIRED', () => {
    expect(couponBlockReason(null, { now: NOW, salePrice })).toBe('COUPON_NOT_FOUND');
    expect(
      couponBlockReason(
        { ...coupon('c', 3000, -1), usedOrderId: 'order-1' },
        { now: NOW, salePrice },
      ),
    ).toBe('COUPON_USED');
    expect(couponBlockReason(coupon('c', 3000, 0), { now: NOW, salePrice })).toBe('COUPON_EXPIRED');
    expect(couponBlockReason(coupon('c', 3000, -1), { now: NOW, salePrice })).toBe(
      'COUPON_EXPIRED',
    );
  });

  it('쿠폰을 빼면 최소 결제 금액보다 작아지는 매물이면 NOT_APPLICABLE', () => {
    expect(couponBlockReason(coupon('c', 3000, 30), { now: NOW, salePrice: 3100 })).toBe(
      'COUPON_NOT_APPLICABLE',
    );
  });
});

describe('arrangeCouponsForSlot (예약 확인 화면, Q1)', () => {
  it('할인 큰 순, 같으면 기한 빠른 순. 첫 번째가 기본 쿠폰', () => {
    const result = arrangeCouponsForSlot(
      [coupon('late', 3000, 60), coupon('small', 1000, 5), coupon('soon', 3000, 10)],
      23_450,
    );
    expect(result.coupons.map((c) => c.couponId)).toEqual(['soon', 'late', 'small']);
    expect(result.defaultCouponId).toBe('soon');
    expect(result.coupons[0]).toEqual({
      couponId: 'soon',
      amount: 3000,
      expiresAt: day(10).toISOString(),
      applicable: true,
    });
  });

  it('그 매물에 못 쓰는 쿠폰은 뒤에 applicable: false로 붙고 기본으로 고르지 않는다', () => {
    const result = arrangeCouponsForSlot(
      [coupon('big', 3000, 10), coupon('small', 1000, 30)],
      3100,
    );
    expect(result.coupons.map((c) => [c.couponId, c.applicable])).toEqual([
      ['small', true],
      ['big', false],
    ]);
    expect(result.defaultCouponId).toBe('small');
  });

  it('쓸 수 있는 쿠폰이 없으면 기본 쿠폰은 null', () => {
    expect(arrangeCouponsForSlot([], 23_450)).toEqual({ coupons: [], defaultCouponId: null });
    expect(arrangeCouponsForSlot([coupon('big', 3000, 10)], 3000).defaultCouponId).toBeNull();
  });
});

describe('arrangeCoupons (내 정보, Q2)', () => {
  it('기한 빠른 순, 모두 applicable, 기본 쿠폰 없음', () => {
    const result = arrangeCoupons([coupon('late', 3000, 60), coupon('soon', 3000, 10)]);
    expect(result.coupons.map((c) => [c.couponId, c.applicable])).toEqual([
      ['soon', true],
      ['late', true],
    ]);
    expect(result.defaultCouponId).toBeNull();
  });
});
