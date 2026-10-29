// 결제 확인 저장 (X-201, C-406, W11 ②). 서버에서만 부른다. 결제 확인(confirmPayment)과 웹훅(W13)이 같이 쓴다.
// 포트원에서 결제 완료(PAID)와 금액을 확인한 뒤, 주문·매물 줄을 잠그고 한 트랜잭션으로 예약을 확정한다.
// 같은 주문을 동시에 두 번 확인해도(새로고침, 웹훅) 주문 줄 잠금 때문에 예약은 하나만 생긴다.

import 'server-only';

import { and, DrizzleQueryError, eq } from 'drizzle-orm';

import type { getDb } from '@/db';
import { type OrderStatus, orders, reservations, slots } from '@/db/schema';

import type { UnconfirmedCode } from './errors';
import { newReservationCode } from './reservation-code';

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export type MyOrder = {
  orderId: string;
  slotId: string;
  /** 실제 결제액(포트원 검증 기준) */
  amount: number;
  status: OrderStatus;
  pgStatus: string | null;
  failureCode: string | null;
  /** 확정된 주문이면 그 예약 */
  reservation: { reservationId: string; reservationCode: string } | null;
};

/** 이 고객의 주문(결제 번호로). 없거나 남의 주문이면 null */
export async function readMyOrder(
  db: Pick<Db, 'select'>,
  paymentId: string,
  customerId: string,
): Promise<MyOrder | null> {
  const [row] = await db
    .select({
      orderId: orders.id,
      customerId: orders.customerId,
      slotId: orders.slotId,
      amount: orders.amount,
      status: orders.status,
      pgStatus: orders.pgStatus,
      failureCode: orders.failureCode,
      reservationId: reservations.id,
      reservationCode: reservations.code,
    })
    .from(orders)
    .leftJoin(reservations, eq(reservations.orderId, orders.id))
    .where(eq(orders.paymentId, paymentId))
    .limit(1);
  if (!row || row.customerId !== customerId) return null;
  return {
    orderId: row.orderId,
    slotId: row.slotId,
    amount: row.amount,
    // DB의 check 제약이 5가지 상태만 허용한다
    status: row.status as OrderStatus,
    pgStatus: row.pgStatus,
    failureCode: row.failureCode,
    reservation:
      row.reservationId && row.reservationCode
        ? { reservationId: row.reservationId, reservationCode: row.reservationCode }
        : null,
  };
}

export type OrderOutcome = {
  /** failed: 결제가 안 됨(실패·취소). paid: 결제는 됐지만 확정하지 못함(W12에서 자동 취소) */
  status: Extract<OrderStatus, 'failed' | 'paid'>;
  pgStatus: string;
  payMethod?: string | null;
  paidAt?: Date | null;
  failureCode: string;
  failureMessage?: string | null;
};

/** 결제 대기 주문에만 결과를 기록한다(이미 확정·기록된 주문은 건드리지 않는다). 기록했으면 true */
export async function recordOrderOutcome(
  db: Pick<Db, 'update'>,
  orderId: string,
  outcome: OrderOutcome,
): Promise<boolean> {
  const updated = await db
    .update(orders)
    .set({
      status: outcome.status,
      pgStatus: outcome.pgStatus,
      payMethod: outcome.payMethod ?? null,
      paidAt: outcome.paidAt ?? null,
      failureCode: outcome.failureCode,
      failureMessage: outcome.failureMessage ?? null,
    })
    .where(and(eq(orders.id, orderId), eq(orders.status, 'pending')))
    .returning({ id: orders.id });
  return updated.length > 0;
}

export type ConfirmOutcome =
  | { ok: true; reservationId: string; reservationCode: string }
  | { ok: false; code: UnconfirmedCode };

const UNCONFIRMED_CODES: readonly string[] = ['HOLD_EXPIRED', 'AMOUNT_MISMATCH', 'SLOT_SOLD'];
const RESERVATION_CODE_TRIES = 5;

/**
 * 결제 완료(PAID)·금액이 확인된 주문을 예약으로 확정한다. 트랜잭션 안에서 부른다.
 * 홀딩한 사람이 이 고객이고, 결제 시각이 홀딩 만료 전이고, 매물이 아직 안 팔렸을 때만
 * 예약 만들기 + 주문 확정 + 매물 '예약됨' + 홀딩 비우기를 한 번에 한다.
 * 확정할 수 없으면 주문을 '결제 확인'(paid)으로 두고 이유를 기록한다(W12에서 포트원 자동 취소).
 * 이미 확정된 주문이면 그 예약을 그대로 돌려준다
 */
export async function confirmPaidOrder(
  tx: Tx,
  input: { orderId: string; pgStatus: string; payMethod: string | null; paidAt: Date },
): Promise<ConfirmOutcome> {
  const [order] = await tx
    .select({
      status: orders.status,
      slotId: orders.slotId,
      customerId: orders.customerId,
      failureCode: orders.failureCode,
    })
    .from(orders)
    .where(eq(orders.id, input.orderId))
    .for('update');
  if (!order) throw new Error(`주문이 없어요: ${input.orderId}`);

  if (order.status === 'confirmed') {
    const [existing] = await tx
      .select({ reservationId: reservations.id, reservationCode: reservations.code })
      .from(reservations)
      .where(eq(reservations.orderId, input.orderId));
    if (!existing) throw new Error(`확정된 주문에 예약이 없어요: ${input.orderId}`);
    return { ok: true, ...existing };
  }
  if (order.status !== 'pending') {
    // 다른 요청이 먼저 '확정 못 함'으로 기록했다
    const code = UNCONFIRMED_CODES.includes(order.failureCode ?? '')
      ? (order.failureCode as UnconfirmedCode)
      : 'SLOT_SOLD';
    return { ok: false, code };
  }

  const [slot] = await tx
    .select({
      status: slots.status,
      holdCustomerId: slots.holdCustomerId,
      holdExpiresAt: slots.holdExpiresAt,
    })
    .from(slots)
    .where(eq(slots.id, order.slotId))
    .for('update');
  if (!slot) throw new Error(`매물이 없어요: ${order.slotId}`);

  const blocked: UnconfirmedCode | null =
    slot.status !== 'scheduled' && slot.status !== 'published'
      ? 'SLOT_SOLD'
      : slot.holdCustomerId !== order.customerId ||
          !slot.holdExpiresAt ||
          input.paidAt.getTime() > slot.holdExpiresAt.getTime()
        ? 'HOLD_EXPIRED'
        : null;
  const paid = { pgStatus: input.pgStatus, payMethod: input.payMethod, paidAt: input.paidAt };
  if (blocked) {
    await tx
      .update(orders)
      .set({ ...paid, status: 'paid', failureCode: blocked })
      .where(eq(orders.id, input.orderId));
    return { ok: false, code: blocked };
  }

  const reservation = await insertReservation(tx, {
    slotId: order.slotId,
    orderId: input.orderId,
    customerId: order.customerId,
  });
  await tx
    .update(orders)
    .set({ ...paid, status: 'confirmed', failureCode: null, failureMessage: null })
    .where(eq(orders.id, input.orderId));
  await tx
    .update(slots)
    .set({ status: 'reserved', holdCustomerId: null, holdExpiresAt: null })
    .where(eq(slots.id, order.slotId));
  return { ok: true, ...reservation };
}

/** 예약번호가 우연히 겹치면(reservations_code_unique) 새 번호로 다시 넣는다. savepoint라 바깥 트랜잭션은 그대로다 */
async function insertReservation(
  tx: Tx,
  values: { slotId: string; orderId: string; customerId: string },
): Promise<{ reservationId: string; reservationCode: string }> {
  for (let attempt = 1; ; attempt++) {
    const code = newReservationCode();
    try {
      return await tx.transaction(async (savepoint) => {
        const [row] = await savepoint
          .insert(reservations)
          .values({ ...values, code, status: 'confirmed' })
          .returning({ reservationId: reservations.id, reservationCode: reservations.code });
        return row;
      });
    } catch (error) {
      const cause = error instanceof DrizzleQueryError ? error.cause : error;
      const constraint = (cause as { constraint_name?: string } | undefined)?.constraint_name;
      if (constraint !== 'reservations_code_unique' || attempt >= RESERVATION_CODE_TRIES)
        throw error;
    }
  }
}
