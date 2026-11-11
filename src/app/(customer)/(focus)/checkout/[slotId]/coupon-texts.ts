// 쿠폰 문구 (C-407, J17, #300). 예약 확인의 쿠폰 고르기와 내 정보의 쿠폰 줄이 같이 쓴다.
// 문구는 동의 문구 4장, 숫자는 정책값에서 가져온다. 금액은 화면에서 계산하지 않는다(previewCheckoutAmount).

import { COUPON_NOT_RETURNED_NOTE } from '@/app/(customer)/(tabs)/reservations/[reservationId]/cancel-texts';
import { formatWon } from '@/lib/format';
import { formatKst } from '@/lib/time';
import type { MyCoupon } from '@/server/coupons';
import { COUPON_VALID_DAYS, MIN_PAYMENT_AMOUNT } from '@/server/policy';

/** 쿠폰 하나. 예: "3,000원 할인 · 2/7(일) 15:00까지" */
export function couponOptionLabel(coupon: Pick<MyCoupon, 'amount' | 'expiresAt'>): string {
  return `${formatWon(coupon.amount)} 할인 · ${formatKst(new Date(coupon.expiresAt))}까지`;
}

/** 이 매물에 못 쓰는 쿠폰(쿠폰을 빼면 최소 결제 금액보다 작아짐) */
export const COUPON_NOT_APPLICABLE_NOTE = `이 매물에는 쓸 수 없어요(쿠폰을 빼면 결제 금액이 ${formatWon(MIN_PAYMENT_AMOUNT)}보다 작아져요)`;

/** 쿠폰 고르는 곳 바로 아래(동의 문구 4장). 쿠폰이 골라진 채로 열리니 늘 보여준다(11/10 #300) */
export const COUPON_SELECT_NOTES = [
  `쿠폰은 결제 1건에 1장만 쓸 수 있어요(받은 날부터 ${COUPON_VALID_DAYS}일).`,
  COUPON_NOT_RETURNED_NOTE,
  '원장님 사정으로 취소되면 쓴 쿠폰도 돌려드려요.',
] as const;

/** 쿠폰 실패(COUPON_*) 뒤 '쓰지 않음'으로 돌렸을 때 */
export function couponResetText(message: string): string {
  return `${message}. 쿠폰을 '쓰지 않음'으로 바꿨어요. 금액을 확인해 주세요.`;
}

/** 내 정보의 쿠폰 줄(#300 Q2). 쿠폰은 기한 빠른 순으로 온다 */
export function myCouponSummary(coupons: readonly Pick<MyCoupon, 'expiresAt'>[]): string {
  if (coupons.length === 0) return '쓸 수 있는 쿠폰이 없어요.';
  return `쿠폰 ${coupons.length}장 · 가장 빠른 기한 ${formatKst(new Date(coupons[0].expiresAt))}`;
}

export const MY_COUPON_NOTE = '결제할 때 할인이 가장 큰 쿠폰이 골라져 있어요. 바꾸거나 빼도 돼요.';
