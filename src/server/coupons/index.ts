// 쿠폰 (C-407, 연결 #17, #300). 화면이 부르는 함수는 '@/server/coupons/coupons'(getMyCoupons)와
// '@/server/payments/checkout'(previewCheckoutAmount, startPayment)에서 가져온다. 여기서는 같이 쓰는 값과 계산을 내보낸다.

export {
  arrangeCoupons,
  arrangeCouponsForSlot,
  type CouponBlockCode,
  couponBlockReason,
  type CouponRow,
  isCouponApplicable,
} from './rules';
export type { MyCoupon, MyCoupons } from './types';
