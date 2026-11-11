// 예약 취소의 DB 읽기·저장 (연결 #9, W14). 서버에서만 부른다.

import 'server-only';

import { and, asc, eq, lt, type SQL, sql } from 'drizzle-orm';

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

/**
 * 한 예약에 하나뿐인 취소 환불 기록(고객 취소·합의 후 취소). unique 인덱스 refunds_cancel_unique의 조건과 글자까지 같아야
 * ON CONFLICT가 그 인덱스를 찾는다(#320)
 */
const CANCEL_REFUND = sql`reason in ('customer_cancel', 'agreed_cancel')`;

export type CancelTarget = {
  reservationId: string;
  orderId: string;
  slotId: string;
  /** 포트원 결제 번호(orders.payment_id) */
  paymentId: string;
  /** 실제 결제액(orders.amount) */
  paidAmount: number;
  startAt: Date;
};

/** 포트원을 부르기 전에 저장해 둔 고객 취소. 다시 처리할 때는 새로 계산하지 않고 이 값을 쓴다 */
export type RequestedCancel = {
  band: RefundBand;
  penaltyRate: number;
  refundAmount: number;
  penaltyAmount: number;
  requestedAt: Date;
};

export type RefundTarget = CancelTarget & {
  status: ReservationStatus;
  /** 판매가(orders.sale_price, 쿠폰 적용 전) */
  salePrice: number;
  couponAmount: number;
  /** 진행 중인 고객 취소. 없으면 null */
  requested: RequestedCancel | null;
};

/** 진행 중으로 남은 고객 취소 하나 */
export type CancelRequest = CancelTarget & RequestedCancel;

/** 이 고객의 예약만. 없거나 남의 예약이면 null */
export async function readRefundTarget(
  reservationId: string,
  customerId: string,
  db: DbReader = getDb(),
): Promise<RefundTarget | null> {
  return readTargetWhere(
    db,
    and(eq(reservations.id, reservationId), eq(reservations.customerId, customerId)),
  );
}

/** 주문의 예약. 웹훅처럼 고객 없이 볼 때 쓴다. 예약이 없으면 null */
export async function readRefundTargetByOrder(
  db: DbReader,
  orderId: string,
): Promise<RefundTarget | null> {
  return readTargetWhere(db, eq(reservations.orderId, orderId));
}

async function readTargetWhere(db: DbReader, where: SQL | undefined): Promise<RefundTarget | null> {
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
      requestedBand: refunds.band,
      requestedRate: refunds.penaltyRate,
      requestedRefund: refunds.refundAmount,
      requestedPenalty: refunds.penaltyAmount,
      requestedAt: refunds.createdAt,
    })
    .from(reservations)
    .innerJoin(orders, eq(orders.id, reservations.orderId))
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .leftJoin(
      refunds,
      and(
        eq(refunds.reservationId, reservations.id),
        eq(refunds.reason, 'customer_cancel'),
        eq(refunds.status, 'requested'),
      ),
    )
    .where(where)
    .limit(1);
  if (!row) return null;
  const {
    requestedBand,
    requestedRate,
    requestedRefund,
    requestedPenalty,
    requestedAt,
    ...target
  } = row;
  return {
    ...target,
    // DB의 check 제약이 3가지 상태만 허용한다
    status: target.status as ReservationStatus,
    requested:
      requestedAt !== null &&
      requestedRate !== null &&
      requestedRefund !== null &&
      requestedPenalty !== null
        ? {
            // 고객 취소 기록에는 늘 구간이 있다
            band: requestedBand as RefundBand,
            penaltyRate: requestedRate,
            refundAmount: requestedRefund,
            penaltyAmount: requestedPenalty,
            requestedAt,
          }
        : null,
  };
}

/**
 * 포트원을 부르기 전에 고객 취소를 진행 중(requested)으로 저장한다. 중간에 멈춰도 정리 작업이 이 기록을 보고 마무리한다.
 * 이미 고객 취소 기록이 있거나(동시에 누름) 합의 후 취소 환불이 진행 중이면 넣지 않고 false
 */
export async function requestCustomerCancel(
  db: DbWriter,
  input: { reservationId: string; orderId: string } & RequestedCancel,
): Promise<boolean> {
  const inserted = await db
    .insert(refunds)
    .values({
      orderId: input.orderId,
      reservationId: input.reservationId,
      reason: 'customer_cancel',
      status: 'requested',
      band: input.band,
      penaltyRate: input.penaltyRate,
      refundAmount: input.refundAmount,
      penaltyAmount: input.penaltyAmount,
      createdAt: input.requestedAt,
    })
    .onConflictDoNothing({ target: refunds.reservationId, where: CANCEL_REFUND })
    .returning({ id: refunds.id });
  return inserted.length > 0;
}

/** 진행 중 표시를 지운다. 고객이 다시 취소할 수 있고, 그때는 새로 계산한다. 끝난 기록은 지우지 않는다 */
export async function clearRequestedCancel(
  db: Pick<ReturnType<typeof getDb>, 'delete'>,
  reservationId: string,
): Promise<void> {
  await db
    .delete(refunds)
    .where(
      and(
        eq(refunds.reservationId, reservationId),
        eq(refunds.reason, 'customer_cancel'),
        eq(refunds.status, 'requested'),
      ),
    );
}

/**
 * 환불이 끝난 고객 취소를 기록한다. 트랜잭션 안에서 부른다.
 * 예약이 아직 '예정'일 때만 바꿔서, 동시에 두 번 불러도 환불 기록은 한 줄이다. 먼저 기록한 요청이 있으면 false.
 * 진행 중 기록이 그 사이 지워졌어도 돈은 이미 돌아갔으므로 새로 넣는다.
 * 쓴 쿠폰은 돌려주지 않는다(C-407). 원장님 알림(W16)과 정산 내역(W15)은 여기서 만들지 않는다
 */
export async function finishCustomerCancel(
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
    /** 운영자 확인이 필요한 이유. 없으면 null */
    reviewReason: string | null;
    hoursBeforeStart: number;
    /** 고객이 취소한 시각 */
    requestedAt: Date;
    /** 환불 처리를 기록하는 시각 */
    now: Date;
  },
): Promise<boolean> {
  const [cancelled] = await tx
    .update(reservations)
    .set({
      status: 'cancelled',
      cancelledAt: input.requestedAt,
      cancelActor: 'customer',
      hoursBeforeStartAtCancel: input.hoursBeforeStart,
    })
    .where(and(eq(reservations.id, input.reservationId), eq(reservations.status, 'confirmed')))
    .returning({ id: reservations.id });
  if (!cancelled) return false;

  await tx.update(slots).set({ status: 'cancelled' }).where(eq(slots.id, input.slotId));
  const done = {
    status: 'done',
    band: input.band,
    penaltyRate: input.penaltyRate,
    refundAmount: input.refundAmount,
    penaltyAmount: input.penaltyAmount,
    pgCancellationId: input.pgCancellationId,
    reviewReason: input.reviewReason,
    processedAt: input.now,
  };
  await tx
    .insert(refunds)
    .values({
      orderId: input.orderId,
      reservationId: input.reservationId,
      reason: 'customer_cancel',
      createdAt: input.requestedAt,
      ...done,
    })
    .onConflictDoUpdate({
      target: refunds.reservationId,
      targetWhere: CANCEL_REFUND,
      set: done,
      // 고객 취소 기록만 끝낸다(합의 후 취소 기록을 고객 취소 값으로 덮지 않는다)
      setWhere: sql`${refunds.reason} = 'customer_cancel'`,
    });
  if (input.pgCancellationId) {
    await tx
      .update(orders)
      .set({ pgStatus: input.penaltyAmount > 0 ? 'PARTIAL_CANCELLED' : 'CANCELLED' })
      .where(eq(orders.id, input.orderId));
  }
  return true;
}

/**
 * 앱을 거치지 않은 취소(포트원 콘솔 등)를 운영자 취소로 기록한다(11/8 nnoinn, #248). 예정 예약일 때만 바꾸고 아니면 false.
 * 위약금 구간은 계산하지 않고 실제 돌려준 금액으로 남긴다. 예정 → 취소로 바꾼 쪽만 기록을 넣으므로
 * 같은 예약에 운영자 취소 기록이 두 번 생기지 않는다(웹훅이 다시 와도 예약이 이미 '취소'라 넘어간다)
 */
export async function finishAdminCancel(
  tx: DbWriter,
  input: {
    reservationId: string;
    orderId: string;
    slotId: string;
    paidAmount: number;
    refundAmount: number;
    pgCancellationId: string | null;
    reviewReason: string | null;
    hoursBeforeStart: number;
    now: Date;
  },
): Promise<boolean> {
  const [cancelled] = await tx
    .update(reservations)
    .set({
      status: 'cancelled',
      cancelledAt: input.now,
      cancelActor: 'admin',
      hoursBeforeStartAtCancel: input.hoursBeforeStart,
    })
    .where(and(eq(reservations.id, input.reservationId), eq(reservations.status, 'confirmed')))
    .returning({ id: reservations.id });
  if (!cancelled) return false;

  await tx.update(slots).set({ status: 'cancelled' }).where(eq(slots.id, input.slotId));
  await tx.insert(refunds).values({
    orderId: input.orderId,
    reservationId: input.reservationId,
    reason: 'admin_exception',
    status: 'done',
    band: null,
    penaltyRate: 0,
    refundAmount: input.refundAmount,
    // 돌려주지 않은 나머지. 일부만 돌려줬을 때의 처리는 이의제기·정산(W15)에서 정한다
    penaltyAmount: input.paidAmount - input.refundAmount,
    pgCancellationId: input.pgCancellationId,
    reviewReason: input.reviewReason,
    processedAt: input.now,
    createdAt: input.now,
  });
  await tx
    .update(orders)
    .set({ pgStatus: input.refundAmount < input.paidAmount ? 'PARTIAL_CANCELLED' : 'CANCELLED' })
    .where(eq(orders.id, input.orderId));
  return true;
}

/** 정리 작업이 볼 오래된 진행 중 고객 취소. 오래된 것부터 */
export async function readStaleCancels(
  db: DbReader,
  input: { requestedBefore: Date; limit: number },
): Promise<CancelRequest[]> {
  const rows = await db
    .select({
      reservationId: reservations.id,
      orderId: reservations.orderId,
      slotId: reservations.slotId,
      paymentId: orders.paymentId,
      paidAmount: orders.amount,
      startAt: slots.startAt,
      band: refunds.band,
      penaltyRate: refunds.penaltyRate,
      refundAmount: refunds.refundAmount,
      penaltyAmount: refunds.penaltyAmount,
      requestedAt: refunds.createdAt,
    })
    .from(refunds)
    .innerJoin(reservations, eq(reservations.id, refunds.reservationId))
    .innerJoin(orders, eq(orders.id, reservations.orderId))
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .where(
      and(
        eq(refunds.reason, 'customer_cancel'),
        eq(refunds.status, 'requested'),
        lt(refunds.createdAt, input.requestedBefore),
      ),
    )
    .orderBy(asc(refunds.createdAt))
    .limit(input.limit);
  // 고객 취소 기록에는 늘 구간이 있다
  return rows.map((row) => ({ ...row, band: row.band as RefundBand }));
}
