'use client';

import type { MyCoupon } from '@/server/coupons';

import { COUPON_NOT_APPLICABLE_NOTE, COUPON_SELECT_NOTES, couponOptionLabel } from './coupon-texts';

/**
 * 예약 확인의 쿠폰 고르기 (C-407, J17, #300). 쿠폰이 없으면 그리지 않는다.
 * '쓰지 않음'과 쿠폰들(서버가 할인 큰 순으로, 못 쓰는 쿠폰은 뒤에 준다). 못 쓰는 쿠폰은 고를 수 없게 하고 이유를 보여준다.
 * 고르면 부모가 previewCheckoutAmount로 금액을 다시 받는다. 아래 안내(동의 문구 4장)는 늘 보여준다
 */
export function CouponPicker({
  coupons,
  selectedId,
  disabled,
  message,
  onSelect,
}: {
  coupons: readonly MyCoupon[];
  selectedId: string | null;
  disabled: boolean;
  /** 쿠폰을 바꾸다 실패했을 때 문구 */
  message: string | null;
  onSelect: (couponId: string | null) => void;
}) {
  if (coupons.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-label="쿠폰">
      <fieldset className="flex flex-col gap-2.5 rounded-xl border p-4" disabled={disabled}>
        <legend className="px-1 text-sm font-semibold">쿠폰</legend>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="radio"
            name="coupon"
            className="size-4 shrink-0 accent-primary"
            checked={selectedId === null}
            onChange={() => onSelect(null)}
          />
          쓰지 않음
        </label>
        {coupons.map((coupon) => (
          <label
            key={coupon.couponId}
            className={
              coupon.applicable
                ? 'flex items-start gap-3 text-sm'
                : 'flex items-start gap-3 text-sm text-muted-foreground'
            }
          >
            <input
              type="radio"
              name="coupon"
              className="mt-0.5 size-4 shrink-0 accent-primary"
              checked={selectedId === coupon.couponId}
              disabled={!coupon.applicable}
              onChange={() => onSelect(coupon.couponId)}
            />
            <span className="flex flex-col gap-0.5">
              {couponOptionLabel(coupon)}
              {coupon.applicable ? null : (
                <span className="text-xs">{COUPON_NOT_APPLICABLE_NOTE}</span>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
      <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
        {COUPON_SELECT_NOTES.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
