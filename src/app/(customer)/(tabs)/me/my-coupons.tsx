import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import {
  MY_COUPON_NOTE,
  myCouponSummary,
} from '@/app/(customer)/(focus)/checkout/[slotId]/coupon-texts';
import type { MyCoupon } from '@/server/coupons';

import { COUPON_BOX_PATH } from './coupons/coupon-box-rules';

/**
 * 내 정보의 쿠폰 줄 (C-407, #300 Q2). "쿠폰 N장 · 가장 빠른 기한". 쿠폰은 getMyCoupons()(매물 없이)가 기한 빠른 순으로 준다.
 * 줄을 누르면 쿠폰함(/me/coupons, #480)에서 쿠폰마다 금액·기한을 본다. 불러오지 못했으면(coupons가 null) 그리지 않는다
 */
export function MyCoupons({ coupons }: { coupons: readonly MyCoupon[] | null }) {
  if (!coupons) return null;
  return (
    <section className="flex flex-col gap-1 border-t pt-6" aria-label="쿠폰">
      <Link
        href={COUPON_BOX_PATH}
        className="-mx-2 flex min-h-10 items-center justify-between gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-muted/60"
      >
        <span className="flex flex-col gap-1">
          <span className="font-semibold">쿠폰함</span>
          <span className="text-sm">{myCouponSummary(coupons)}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
      {coupons.length > 0 ? (
        <p className="text-xs text-muted-foreground">{MY_COUPON_NOTE}</p>
      ) : null}
    </section>
  );
}
