// 운영자 고객 상세 '쿠폰' 칸의 표시 모양(A-102, C-407). 계산만 한다(화면과 테스트가 같이 쓴다).
// 쓸 수 있는 쿠폰은 고객 쿠폰함과 같은 기준이다: 안 썼고(쓴 주문이 없고) 기한이 남은 쿠폰(coupons/rules.ts의 couponBlockReason과 같은 순서로 본다).
// 원장님 사정 취소·무효로 돌려받은 쿠폰은 쓴 주문이 비워져서 '쓸 수 있음'으로 돌아온다. 그때 쓴 예약은 '돌려받은 기록'으로 따로 보여 준다

import type { CancelActor } from '@/db/schema/payments';
import { COUPON_REASON_LABELS } from '@/server/accounts/history-texts';

import type { CustomerCouponRow, CustomerCouponUse } from './coupon-queries';

/** 쿠폰의 지금 상태 */
export type CouponState = 'usable' | 'used' | 'expired';

export const COUPON_STATE_LABELS: Record<CouponState, string> = {
  usable: '쓸 수 있음',
  used: '사용함',
  expired: '기한 지남',
};

/** 쓴 주문이 있으면 사용함, 없으면 기한(이 시각부터 못 씀)으로 쓸 수 있음·기한 지남을 가른다 */
export function couponState(
  coupon: { usedOrderId: string | null; expiresAt: Date },
  now: Date,
): CouponState {
  if (coupon.usedOrderId !== null) return 'used';
  return coupon.expiresAt.getTime() <= now.getTime() ? 'expired' : 'usable';
}

/** 쓴 쿠폰을 돌려받은 이유. 돌려주는 곳은 원장님 사정 취소(X-207)와 무효(A-108) 둘뿐이다 */
export type CouponReturnReason = 'owner_fault' | 'void';

export const COUPON_RETURN_LABELS: Record<CouponReturnReason | 'unknown', string> = {
  owner_fault: '원장님 사정 취소로 돌려받음',
  void: '무효로 돌려받음',
  unknown: '돌려받음',
};

/**
 * 그 예약 때문에 쿠폰을 돌려받은 이유. 모르면 null.
 * 원장님 사정 취소가 먼저다: 원장님 사정 취소로 이미 돌려준 예약을 나중에 무효로 해도 쿠폰을 다시 돌려주지 않는다
 */
export function couponReturnReason(use: {
  cancelActor: CancelActor | null;
  voidedAt: Date | null;
}): CouponReturnReason | null {
  if (use.cancelActor === 'owner_fault') return 'owner_fault';
  if (use.voidedAt) return 'void';
  return null;
}

/** 예약 링크에 쓸 값 */
type ReservationRef = { reservationId: string; code: string };

/** 화면에 보여 줄 쿠폰 한 장 */
export type CustomerCouponView = {
  couponId: string;
  amount: number;
  /** 받은 이유 이름 */
  reasonLabel: string;
  /** 원장님 사정 취소 보상이면 원인 예약 */
  source: ReservationRef | null;
  issuedAt: Date;
  expiresAt: Date;
  state: CouponState;
  /** 사용함이면 지금 쓴 예약. 예약을 찾지 못하면 null */
  usedOn: ReservationRef | null;
  /** 사용함이면 쓴 시각 */
  usedAt: Date | null;
  /** 썼다가 돌려받은 예약. 먼저 결제한 것부터 */
  returns: (ReservationRef & { label: string })[];
};

const toRef = (use: CustomerCouponUse): ReservationRef => ({
  reservationId: use.reservationId,
  code: use.code,
});

/** 쿠폰들을 화면에 보여 줄 모양으로. 순서는 받은 그대로(최근에 받은 것부터) */
export function customerCouponViews(
  coupons: readonly CustomerCouponRow[],
  now: Date,
): CustomerCouponView[] {
  return coupons.map((coupon) => {
    const state = couponState(coupon, now);
    const current = coupon.uses.find((use) => use.orderId === coupon.usedOrderId);
    return {
      couponId: coupon.couponId,
      amount: coupon.amount,
      reasonLabel: COUPON_REASON_LABELS[coupon.reason] ?? coupon.reason,
      source: coupon.source,
      issuedAt: coupon.issuedAt,
      expiresAt: coupon.expiresAt,
      state,
      usedOn: state === 'used' && current ? toRef(current) : null,
      usedAt: state === 'used' ? coupon.usedAt : null,
      // 지금 쓴 주문이 아닌 예약은 돌려받은 것이다(고객 취소·합의 후 취소는 돌려주지 않아서 쓴 주문이 그대로 남는다)
      returns: coupon.uses
        .filter((use) => use.orderId !== coupon.usedOrderId)
        .map((use) => ({
          ...toRef(use),
          label: COUPON_RETURN_LABELS[couponReturnReason(use) ?? 'unknown'],
        })),
    };
  });
}

/** 맨 위 요약: 쓸 수 있는 쿠폰 수와 금액 합계 */
export function usableCouponSummary(views: readonly CustomerCouponView[]): {
  count: number;
  total: number;
} {
  const usable = views.filter((view) => view.state === 'usable');
  return { count: usable.length, total: usable.reduce((sum, view) => sum + view.amount, 0) };
}
