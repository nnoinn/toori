// 쿠폰 규칙 (C-407, #300, 11/10 결정). 계산만 한다. 화면은 이 계산 대신 getMyCoupons·previewCheckoutAmount 결과를 쓴다.
//
// - 결제 1건에 1장. 안 썼고(쓴 주문이 없고) 기한이 남은 쿠폰만 쓴다
// - 판매가 − 쿠폰이 최소 결제 금액(MIN_PAYMENT_AMOUNT)보다 작아지는 매물에는 쓸 수 없다(Q3)
// - 예약 확인 화면은 할인이 가장 큰 쿠폰을 골라 둔 채로 연다. 할인이 같으면 기한이 빠른 쿠폰, 그 매물에 못 쓰는 쿠폰은 고르지 않는다(Q1)

import { MIN_PAYMENT_AMOUNT } from '@/server/policy/owner-fault';

import type { MyCoupon, MyCoupons } from './types';

/** 규칙에 필요한 쿠폰 값 */
export type CouponRow = {
  couponId: string;
  amount: number;
  expiresAt: Date;
  /** 쓴 주문. 비어 있으면 안 쓴 쿠폰 */
  usedOrderId: string | null;
};

export type CouponBlockCode =
  'COUPON_NOT_FOUND' | 'COUPON_USED' | 'COUPON_EXPIRED' | 'COUPON_NOT_APPLICABLE';

/** 이 매물(판매가)에 쓸 수 있는 할인 금액인지 */
export function isCouponApplicable(amount: number, salePrice: number): boolean {
  return salePrice - amount >= MIN_PAYMENT_AMOUNT;
}

/** 이 쿠폰을 지금 이 매물에 쓸 수 없는 이유. 쓸 수 있으면 null. 내 쿠폰이 아니면 coupon에 null을 넘긴다 */
export function couponBlockReason(
  coupon: CouponRow | null,
  { now, salePrice }: { now: Date; salePrice: number },
): CouponBlockCode | null {
  if (!coupon) return 'COUPON_NOT_FOUND';
  if (coupon.usedOrderId !== null) return 'COUPON_USED';
  if (coupon.expiresAt.getTime() <= now.getTime()) return 'COUPON_EXPIRED';
  if (!isCouponApplicable(coupon.amount, salePrice)) return 'COUPON_NOT_APPLICABLE';
  return null;
}

const byExpiry = (a: CouponRow, b: CouponRow) => a.expiresAt.getTime() - b.expiresAt.getTime();
const byDiscountThenExpiry = (a: CouponRow, b: CouponRow) => b.amount - a.amount || byExpiry(a, b);

function toMyCoupon(coupon: CouponRow, applicable: boolean): MyCoupon {
  return {
    couponId: coupon.couponId,
    amount: coupon.amount,
    expiresAt: coupon.expiresAt.toISOString(),
    applicable,
  };
}

/** 내 정보: 쓸 수 있는 쿠폰(안 쓰고 기한 남은 것)을 기한 빠른 순으로. 고르는 화면이 아니라 기본 쿠폰은 없다 */
export function arrangeCoupons(usable: CouponRow[]): MyCoupons {
  return {
    coupons: [...usable].sort(byExpiry).map((coupon) => toMyCoupon(coupon, true)),
    defaultCouponId: null,
  };
}

/** 예약 확인 화면: 이 매물에 쓸 수 있는 쿠폰을 할인 큰 순으로 먼저, 못 쓰는 쿠폰은 뒤에. 첫 번째로 쓸 수 있는 쿠폰이 기본 */
export function arrangeCouponsForSlot(usable: CouponRow[], salePrice: number): MyCoupons {
  const sorted = [...usable].sort(byDiscountThenExpiry);
  const applicable = sorted.filter((coupon) => isCouponApplicable(coupon.amount, salePrice));
  const notApplicable = sorted.filter((coupon) => !isCouponApplicable(coupon.amount, salePrice));
  return {
    coupons: [
      ...applicable.map((coupon) => toMyCoupon(coupon, true)),
      ...notApplicable.map((coupon) => toMyCoupon(coupon, false)),
    ],
    defaultCouponId: applicable[0]?.couponId ?? null,
  };
}
