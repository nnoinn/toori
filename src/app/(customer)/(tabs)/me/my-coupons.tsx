import {
  MY_COUPON_NOTE,
  myCouponSummary,
} from '@/app/(customer)/(focus)/checkout/[slotId]/coupon-texts';
import type { MyCoupon } from '@/server/coupons';

/**
 * 내 정보의 쿠폰 줄 (C-407, #300 Q2). "쿠폰 N장 · 가장 빠른 기한". 쿠폰은 getMyCoupons()(매물 없이)가 기한 빠른 순으로 준다.
 * 불러오지 못했으면(coupons가 null) 그리지 않는다
 */
export function MyCoupons({ coupons }: { coupons: readonly MyCoupon[] | null }) {
  if (!coupons) return null;
  return (
    <section className="flex flex-col gap-1 border-t pt-6" aria-label="쿠폰">
      <h2 className="font-semibold">쿠폰</h2>
      <p className="text-sm">{myCouponSummary(coupons)}</p>
      {coupons.length > 0 ? (
        <p className="text-xs text-muted-foreground">{MY_COUPON_NOTE}</p>
      ) : null}
    </section>
  );
}
