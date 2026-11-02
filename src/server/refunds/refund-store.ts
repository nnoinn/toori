// 예약 취소의 DB 읽기·저장 (연결 #9, W14). 서버에서만 부른다.

import 'server-only';

import { and, eq } from 'drizzle-orm';

import { getDb } from '@/db';
import {
  orders,
  refunds,
  type RefundBand,
  type ReservationStatus,
  reservations,
  slots,
} from '@/db/schema';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;
type DbWriter = Pick<ReturnType<typeof getDb>, 'insert' | 'update'>;

export type RefundTarget = {
  reservationId: string;
  orderId: string;
  slotId: string;
  /** 포트원 결제 번호(orders.payment_id) */
  paymentId: string;
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
      orderId: reservations.orderId,
      slotId: reservations.slotId,
      paymentId: orders.paymentId,
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

/**
 * 고객 취소를 기록한다. 포트원 환불이 끝난 뒤 트랜잭션 안에서 부른다.
 * 예약이 아직 '예정'일 때만 바꿔서, 동시에 두 번 불러도 환불 기록은 한 줄이다. 먼저 기록한 요청이 있으면 false.
 * 쓴 쿠폰은 돌려주지 않는다(C-407). 원장님 알림(W16)과 정산 내역(W15)은 여기서 만들지 않는다
 */
export async function recordCustomerCancel(
  tx: DbWriter,
  input: {
    reservationId: string;
    orderId: string;
    slotId: string;
    band: RefundBand;
    penaltyRate: number;
    refundAmount: number;
    penaltyAmount: number;
    /** 포트원 취소 번호. 포트원을 부르지 않았으면 null(돌려줄 돈이 없거나 시드·시나리오 주문) */
    pgCancellationId: string | null;
    hoursBeforeStart: number;
    now: Date;
  },
): Promise<boolean> {
  const [cancelled] = await tx
    .update(reservations)
    .set({
      status: 'cancelled',
      cancelledAt: input.now,
      cancelActor: 'customer',
      hoursBeforeStartAtCancel: input.hoursBeforeStart,
    })
    .where(and(eq(reservations.id, input.reservationId), eq(reservations.status, 'confirmed')))
    .returning({ id: reservations.id });
  if (!cancelled) return false;

  await tx.update(slots).set({ status: 'cancelled' }).where(eq(slots.id, input.slotId));
  await tx.insert(refunds).values({
    orderId: input.orderId,
    reservationId: input.reservationId,
    reason: 'customer_cancel',
    band: input.band,
    penaltyRate: input.penaltyRate,
    refundAmount: input.refundAmount,
    penaltyAmount: input.penaltyAmount,
    pgCancellationId: input.pgCancellationId,
    processedAt: input.now,
  });
  if (input.pgCancellationId) {
    await tx
      .update(orders)
      .set({ pgStatus: input.penaltyAmount > 0 ? 'PARTIAL_CANCELLED' : 'CANCELLED' })
      .where(eq(orders.id, input.orderId));
  }
  return true;
}
