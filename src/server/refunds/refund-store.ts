// 예약 취소에 필요한 DB 읽기 (연결 #9). 서버에서만 부른다. W14 실제 취소도 그대로 쓴다.

import 'server-only';

import { and, eq } from 'drizzle-orm';

import { getDb } from '@/db';
import { orders, type ReservationStatus, reservations, slots } from '@/db/schema';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

export type RefundTarget = {
  reservationId: string;
  status: ReservationStatus;
  /** 실제 결제액(orders.amount) */
  paidAmount: number;
  /** 판매가(orders.sale_price, 쿠폰 적용 전) */
  salePrice: number;
  couponAmount: number;
  startAt: Date;
};

/** 이 고객의 예약만. 없거나 남의 예약이면 null */
export async function readRefundTarget(
  reservationId: string,
  customerId: string,
  db: DbReader = getDb(),
): Promise<RefundTarget | null> {
  const [row] = await db
    .select({
      reservationId: reservations.id,
      status: reservations.status,
      paidAmount: orders.amount,
      salePrice: orders.salePrice,
      couponAmount: orders.couponAmount,
      startAt: slots.startAt,
    })
    .from(reservations)
    .innerJoin(orders, eq(orders.id, reservations.orderId))
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .where(and(eq(reservations.id, reservationId), eq(reservations.customerId, customerId)))
    .limit(1);
  // DB의 check 제약이 3가지 상태만 허용한다
  return row ? { ...row, status: row.status as ReservationStatus } : null;
}
