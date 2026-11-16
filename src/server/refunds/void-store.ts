// 예약 무효(A-108, #423)의 DB 읽기·저장. 서버에서만 부른다.
// 고객 취소와 같은 방식이다: 포트원을 부르기 전에 진행 중(requested, reason void) 기록을 남기고, 환불이 끝나면 한 트랜잭션에서
// 무효 시각(voided_at), 예정 예약이면 예약·매물 '취소'(취소한 쪽 admin), 환불 기록 끝, 쓴 쿠폰 돌려주기, 답을 기다리는 합의 후 취소 요청 닫기,
// 아직 묶이지 않은 정산 줄 지우기를 한다. 무효 환불은 예약 하나에 하나(refunds_void_unique)이고, 진행 중 환불도 예약 하나에 하나(refunds_requested_unique)다.

import 'server-only';

import { and, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import {
  agreedCancelRequests,
  coupons,
  orders,
  refunds,
  reservations,
  settlementItems,
  slots,
} from '@/db/schema';
import type { ReservationStatus } from '@/db/schema/payments';
import { hoursUntil } from '@/lib/time';
import { recordAdminAction } from '@/server/admin/action-store';

import { voidBlockReason } from './void-rules';

type Db = ReturnType<typeof getDb>;
type DbReader = Pick<Db, 'select'>;
type Tx = Pick<Db, 'select' | 'insert' | 'update' | 'delete'>;

/** 무효로 할 예약의 값 */
export type VoidTarget = {
  reservationId: string;
  orderId: string;
  slotId: string;
  /** 포트원 결제 번호(orders.payment_id) */
  paymentId: string;
  status: ReservationStatus;
  startAt: Date;
  /** 실제 결제액(orders.amount) */
  paidAmount: number;
  /** 이미 돌려준 금액(이 주문의 끝난 환불 합계) */
  refundedAmount: number;
  /** 손님이 이 주문에 쓴 쿠폰이 아직 쓴 상태로 남아 있으면 그 금액, 없거나 돌려줬으면 0 */
  usedCouponAmount: number;
  voidedAt: Date | null;
  /** 정산에 묶인 줄이 있다(정산 번호가 채워진 정산 줄) */
  settlementBundled: boolean;
  /** 다른 취소 환불(고객 취소·합의 후 취소·원장님 귀책 취소)이 진행 중이다 */
  cancelInProgress: boolean;
  /** 진행 중인 무효 환불. 다시 누르면 이 금액으로 이어서 한다 */
  voidRequested: { refundAmount: number; requestedAt: Date } | null;
};

/** 무효로 할 예약을 읽는다. 없으면 null */
export async function readVoidTarget(
  db: DbReader,
  reservationId: string,
): Promise<VoidTarget | null> {
  const [row] = await db
    .select({
      reservationId: reservations.id,
      orderId: reservations.orderId,
      slotId: reservations.slotId,
      paymentId: orders.paymentId,
      status: reservations.status,
      startAt: slots.startAt,
      paidAmount: orders.amount,
      couponId: orders.couponId,
      couponAmount: orders.couponAmount,
      voidedAt: reservations.voidedAt,
      refundedAmount: sql<number>`coalesce((select sum(r.refund_amount) from ${refunds} r where r.order_id = ${orders.id} and r.status = 'done'), 0)::int`,
      settlementBundled: sql<boolean>`exists (select 1 from ${settlementItems} s where s.order_id = ${orders.id} and s.settlement_id is not null)`,
      couponInUse: sql<boolean>`exists (select 1 from ${coupons} c where c.id = ${orders.couponId} and c.used_order_id = ${orders.id})`,
    })
    .from(reservations)
    .innerJoin(orders, eq(orders.id, reservations.orderId))
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .where(eq(reservations.id, reservationId));
  if (!row) return null;
  const requested = await db
    .select({
      reason: refunds.reason,
      refundAmount: refunds.refundAmount,
      createdAt: refunds.createdAt,
    })
    .from(refunds)
    .where(and(eq(refunds.reservationId, reservationId), eq(refunds.status, 'requested')));
  const voidRow = requested.find((r) => r.reason === 'void');
  const { couponId, couponAmount, couponInUse, ...rest } = row;
  return {
    ...rest,
    // DB의 check 제약이 세 상태만 허용한다
    status: rest.status as ReservationStatus,
    usedCouponAmount: couponId && couponInUse ? couponAmount : 0,
    cancelInProgress: requested.some((r) => r.reason !== 'void'),
    voidRequested: voidRow
      ? { refundAmount: voidRow.refundAmount, requestedAt: voidRow.createdAt }
      : null,
  };
}

/** 예약 줄을 잠그고(FOR UPDATE) 무효로 할 예약을 다시 읽는다. 트랜잭션 안에서 부른다. 없으면 null */
export async function lockVoidTarget(tx: Tx, reservationId: string): Promise<VoidTarget | null> {
  const [locked] = await tx
    .select({ id: reservations.id })
    .from(reservations)
    .where(eq(reservations.id, reservationId))
    .for('update');
  if (!locked) return null;
  return readVoidTarget(tx, reservationId);
}

/**
 * 무효를 시작한다: 예약 줄을 잠그고 다시 확인한 뒤 진행 중 무효 환불 기록과 운영자 처리 기록(reservation.void, 메모 = 원장님 요청)을
 * 같은 트랜잭션에서 남긴다. 무효 환불은 이 기록을 보고 정리 작업이 마무리하므로 처리 기록은 시작할 때 남긴다.
 * 막히면 그 이유(이미 무효, 정산에 묶임, 다른 취소 진행 중, 다른 무효 요청이 먼저 들어옴)
 */
export async function startVoid(
  db: Db,
  input: {
    reservationId: string;
    orderId: string;
    refundAmount: number;
    adminId: string;
    ownerRequest: string;
    now: Date;
  },
): Promise<'started' | 'ALREADY_VOIDED' | 'SETTLEMENT_BUNDLED' | 'CANCEL_IN_PROGRESS'> {
  return db.transaction(async (tx) => {
    const target = await lockVoidTarget(tx, input.reservationId);
    if (!target) throw new Error(`무효로 할 예약이 없어요: ${input.reservationId}`);
    const blocked = voidBlockReason(target);
    if (blocked) return blocked;
    // 다른 운영자가 먼저 시작했다
    if (target.voidRequested) return 'CANCEL_IN_PROGRESS';
    const [started] = await tx
      .insert(refunds)
      .values({
        orderId: input.orderId,
        reservationId: input.reservationId,
        reason: 'void',
        status: 'requested',
        band: null,
        penaltyRate: 0,
        refundAmount: input.refundAmount,
        penaltyAmount: 0,
        processedBy: input.adminId,
        createdAt: input.now,
      })
      // 예약 줄을 잠그지 않는 고객 취소가 그 사이 진행 중 기록을 넣었으면 refunds_requested_unique에 걸린다. 대상을 정하지 않아서 어느 인덱스든 넣지 않는다
      .onConflictDoNothing()
      .returning({ id: refunds.id });
    if (!started) return 'CANCEL_IN_PROGRESS';
    await recordAdminAction(tx, {
      adminId: input.adminId,
      action: 'reservation.void',
      targetType: 'reservation',
      targetId: input.reservationId,
      memo: input.ownerRequest,
    });
    return 'started';
  });
}

/** 돌려준 돈이 없는 무효 요청을 지운다(포트원이 거절했고 돌아간 돈도 없음). 예약은 그대로다 */
export async function clearVoidRequest(db: Pick<Db, 'delete'>, reservationId: string) {
  await db
    .delete(refunds)
    .where(
      and(
        eq(refunds.reservationId, reservationId),
        eq(refunds.reason, 'void'),
        eq(refunds.status, 'requested'),
      ),
    );
}

export type FinishedVoid = { couponReturned: boolean };

/**
 * 무효를 끝낸다(한 트랜잭션에서 부른다). 이미 무효면 null.
 * 돌려줄 돈이 없어서 진행 중 기록 없이 바로 끝내는 무효는 운영자 처리 기록을 여기서 남긴다(record)
 */
export async function finishVoid(
  tx: Tx,
  input: {
    reservationId: string;
    orderId: string;
    slotId: string;
    startAt: Date;
    /** 이번에 돌려준 금액 */
    refundAmount: number;
    /** 포트원 취소 번호. 포트원을 부르지 않았으면 null */
    pgCancellationId: string | null;
    now: Date;
    /** 진행 중 기록 없이 끝낼 때 남기는 운영자 처리 기록 */
    record?: { adminId: string; ownerRequest: string };
  },
): Promise<FinishedVoid | null> {
  const [locked] = await tx
    .select({ status: reservations.status, voidedAt: reservations.voidedAt })
    .from(reservations)
    .where(eq(reservations.id, input.reservationId))
    .for('update');
  if (!locked || locked.voidedAt) return null;

  const wasConfirmed = locked.status === 'confirmed';
  await tx
    .update(reservations)
    .set(
      wasConfirmed
        ? {
            voidedAt: input.now,
            status: 'cancelled',
            cancelledAt: input.now,
            cancelActor: 'admin',
            hoursBeforeStartAtCancel: hoursUntil(input.startAt, input.now),
          }
        : { voidedAt: input.now },
    )
    .where(eq(reservations.id, input.reservationId));
  if (wasConfirmed) {
    await tx.update(slots).set({ status: 'cancelled' }).where(eq(slots.id, input.slotId));
  }

  await tx
    .update(refunds)
    .set({
      status: 'done',
      refundAmount: input.refundAmount,
      pgCancellationId: input.pgCancellationId,
      processedAt: input.now,
    })
    .where(
      and(
        eq(refunds.reservationId, input.reservationId),
        eq(refunds.reason, 'void'),
        eq(refunds.status, 'requested'),
      ),
    );
  if (input.pgCancellationId) {
    await tx.update(orders).set({ pgStatus: 'CANCELLED' }).where(eq(orders.id, input.orderId));
  }

  // 쓴 쿠폰은 원래 기한 그대로 돌려준다(이 주문에 쓴 상태일 때만)
  const [order] = await tx
    .select({ couponId: orders.couponId })
    .from(orders)
    .where(eq(orders.id, input.orderId));
  let couponReturned = false;
  if (order?.couponId) {
    const returned = await tx
      .update(coupons)
      .set({ usedOrderId: null, usedAt: null })
      .where(and(eq(coupons.id, order.couponId), eq(coupons.usedOrderId, input.orderId)))
      .returning({ id: coupons.id });
    couponReturned = returned.length > 0;
  }

  await tx
    .update(agreedCancelRequests)
    .set({ status: 'closed', respondedAt: input.now })
    .where(
      and(
        eq(agreedCancelRequests.reservationId, input.reservationId),
        eq(agreedCancelRequests.status, 'requested'),
      ),
    );

  // 아직 묶이지 않은 정산 줄은 지운다(무효는 기준 금액 0). 묶인 줄은 지우지 않고 알린다(시작할 때 막지만 정산 묶기와 겹친 경우)
  await tx
    .delete(settlementItems)
    .where(and(eq(settlementItems.orderId, input.orderId), isNull(settlementItems.settlementId)));
  const [bundled] = await tx
    .select({ id: settlementItems.id })
    .from(settlementItems)
    .where(and(eq(settlementItems.orderId, input.orderId), isNotNull(settlementItems.settlementId)))
    .limit(1);
  if (bundled) {
    console.error(
      '[void] 정산에 묶인 뒤 무효가 끝났어요. 지급 요청 전에 정산에서 빼 주세요:',
      input.reservationId,
    );
  }

  if (input.record) {
    await recordAdminAction(tx, {
      adminId: input.record.adminId,
      action: 'reservation.void',
      targetType: 'reservation',
      targetId: input.reservationId,
      memo: input.record.ownerRequest,
    });
  }
  return { couponReturned };
}

/** 정리 작업이 마무리할 진행 중 무효 하나 */
export type StaleVoid = {
  reservationId: string;
  orderId: string;
  slotId: string;
  paymentId: string;
  startAt: Date;
  refundAmount: number;
};

/** requestedBefore보다 먼저 시작해서 아직 진행 중인 무효(오래된 것부터) */
export async function readStaleVoids(
  db: DbReader,
  input: { requestedBefore: Date; limit: number },
): Promise<StaleVoid[]> {
  return db
    .select({
      reservationId: reservations.id,
      orderId: reservations.orderId,
      slotId: reservations.slotId,
      paymentId: orders.paymentId,
      startAt: slots.startAt,
      refundAmount: refunds.refundAmount,
    })
    .from(refunds)
    .innerJoin(reservations, eq(reservations.id, refunds.reservationId))
    .innerJoin(orders, eq(orders.id, reservations.orderId))
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .where(
      and(
        inArray(refunds.reason, ['void']),
        eq(refunds.status, 'requested'),
        lt(refunds.createdAt, input.requestedBefore),
      ),
    )
    .orderBy(refunds.createdAt)
    .limit(input.limit);
}
