// 운영자 고객 상세의 '쿠폰' 칸(A-102, C-407). 그 고객이 받은 쿠폰 전부와, 쿠폰을 쓴 예약을 읽는다. 서버에서만 부른다.
// 원장님 사정 취소(X-207)·무효(A-108)로 쿠폰을 돌려주면 쿠폰의 '쓴 주문'을 비워서, 쿠폰만 보면 썼던 기록이 남지 않는다.
// 그래서 주문에 남은 쿠폰(orders.coupon_id)으로 그 쿠폰을 쓴 예약을 따로 읽는다. 읽기만 하고, 운영자가 쿠폰을 주거나 지우지는 않는다

import 'server-only';

import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { getDb } from '@/db';
import { coupons, orders, reservations } from '@/db/schema';
import type { CancelActor } from '@/db/schema/payments';
import type { CouponReason } from '@/db/schema/refunds';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

/** 쿠폰을 쓴 예약 한 건 */
export type CustomerCouponUse = {
  reservationId: string;
  code: string;
  orderId: string;
  /** 취소한 쪽. 취소되지 않았으면 null */
  cancelActor: CancelActor | null;
  /** 운영자가 무효로 한 시각. 무효가 아니면 null */
  voidedAt: Date | null;
};

/** 쿠폰 한 장 */
export type CustomerCouponRow = {
  couponId: string;
  amount: number;
  reason: CouponReason;
  /** 원장님 사정 취소 보상이면 원인 예약 */
  source: { reservationId: string; code: string } | null;
  issuedAt: Date;
  /** 이 시각부터 쓸 수 없다 */
  expiresAt: Date;
  /** 지금 쓴 주문. 비어 있으면 안 쓴 쿠폰(돌려받은 쿠폰 포함) */
  usedOrderId: string | null;
  usedAt: Date | null;
  /** 이 쿠폰을 쓴 예약(결제가 끝나 예약이 된 주문만). 먼저 결제한 것부터 */
  uses: CustomerCouponUse[];
};

/** 원장님 사정 취소 보상의 원인 예약. 쿠폰을 쓴 예약과 같은 표라 이름을 따로 붙인다 */
const sourceReservations = alias(reservations, 'source_reservations');

/** 그 고객이 받은 쿠폰 전부. 최근에 받은 것부터 */
export async function selectCustomerCoupons(
  db: DbReader,
  customerId: string,
): Promise<CustomerCouponRow[]> {
  const rows = await db
    .select({
      couponId: coupons.id,
      amount: coupons.amount,
      reason: coupons.reason,
      sourceReservationId: sourceReservations.id,
      sourceCode: sourceReservations.code,
      issuedAt: coupons.issuedAt,
      expiresAt: coupons.expiresAt,
      usedOrderId: coupons.usedOrderId,
      usedAt: coupons.usedAt,
    })
    .from(coupons)
    .leftJoin(sourceReservations, eq(sourceReservations.id, coupons.sourceReservationId))
    .where(eq(coupons.customerId, customerId))
    .orderBy(desc(coupons.issuedAt), desc(coupons.id));
  if (rows.length === 0) return [];

  // 결제를 시작했다가 실패한 주문에도 쿠폰이 적혀 있어서, 예약이 된 주문만 본다
  const uses = await db
    .select({
      couponId: orders.couponId,
      reservationId: reservations.id,
      code: reservations.code,
      orderId: reservations.orderId,
      cancelActor: reservations.cancelActor,
      voidedAt: reservations.voidedAt,
    })
    .from(reservations)
    .innerJoin(orders, eq(orders.id, reservations.orderId))
    .where(
      and(
        eq(orders.customerId, customerId),
        inArray(
          orders.couponId,
          rows.map((row) => row.couponId),
        ),
      ),
    )
    .orderBy(asc(orders.createdAt), asc(reservations.id));

  // DB의 check 제약이 정해 둔 사유·취소한 쪽만 허용한다
  return rows.map(({ sourceReservationId, sourceCode, ...row }) => ({
    ...row,
    reason: row.reason as CouponReason,
    source:
      sourceReservationId && sourceCode
        ? { reservationId: sourceReservationId, code: sourceCode }
        : null,
    uses: uses
      .filter((use) => use.couponId !== null)
      .map((use) => ({
        reservationId: use.reservationId,
        code: use.code,
        orderId: use.orderId,
        cancelActor: use.cancelActor as CancelActor | null,
        voidedAt: use.voidedAt,
      })),
  }));
}
