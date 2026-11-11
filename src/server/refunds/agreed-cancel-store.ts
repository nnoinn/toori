// 합의 후 취소: DB 읽기 (X-208, #301). 서버에서만 부른다. 내 예약·내 샵 예약인지는 agreed-cancel.ts가 본다.
// 가짜 결과 버전이라 요청 표(#320 승인 뒤 마이그레이션)는 아직 없고, 예약 값만 읽는다.

import 'server-only';

import { eq } from 'drizzle-orm';

import type { getDb } from '@/db';
import { orders, reservations, slots } from '@/db/schema';
import type { ReservationStatus, VisitResult } from '@/db/schema/payments';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

export type AgreedCancelTarget = {
  reservationId: string;
  customerId: string;
  shopId: string;
  status: ReservationStatus;
  visitResult: VisitResult | null;
  startAt: Date;
  /** 판매가(쿠폰 적용 전). 원장님 기준 금액 계산에 쓴다 */
  salePrice: number;
  /** 실제 결제액(쿠폰을 뺀 금액). 손님 환불 계산에 쓴다 */
  paidAmount: number;
  couponAmount: number;
};

/** 예약 하나의 합의 후 취소 값. 없으면 null */
export async function readAgreedCancelTarget(
  db: DbReader,
  reservationId: string,
): Promise<AgreedCancelTarget | null> {
  const [row] = await db
    .select({
      reservationId: reservations.id,
      customerId: reservations.customerId,
      shopId: slots.shopId,
      status: reservations.status,
      visitResult: reservations.visitResult,
      startAt: slots.startAt,
      salePrice: orders.salePrice,
      paidAmount: orders.amount,
      couponAmount: orders.couponAmount,
    })
    .from(reservations)
    .innerJoin(orders, eq(orders.id, reservations.orderId))
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .where(eq(reservations.id, reservationId));
  if (!row) return null;
  // DB의 check 제약이 정해진 값만 허용한다
  return {
    ...row,
    status: row.status as ReservationStatus,
    visitResult: row.visitResult as VisitResult | null,
  };
}
