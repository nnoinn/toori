// 원장님 귀책 취소(X-207, S-409, #419)의 쿠폰·패널티 기록. 서버에서만 부른다.
// 환불이 끝난 원장님 귀책 취소를 기록하는 같은 트랜잭션(finishCancel)에서 부른다. 예약을 '취소'로 바꾼 쪽만 부르므로 한 번만 돈다.
// 다시 돌아도 보상 쿠폰은 원인 예약 하나에 한 장(coupons_compensation_unique), 패널티는 예약 하나에 하나(owner_penalties_reservation_id_unique)다

import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import {
  agreedCancelRequests,
  coupons,
  orders,
  ownerPenalties,
  reservations,
  slots,
} from '@/db/schema';
import {
  COUPON_VALID_DAYS,
  OWNER_FAULT_COUPON_AMOUNT,
  OWNER_FAULT_PENALTY_AMOUNT,
} from '@/server/policy/owner-fault';

type Tx = Pick<ReturnType<typeof getDb>, 'select' | 'insert' | 'update'>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 보상 쿠폰 unique 인덱스 coupons_compensation_unique의 조건. 글자까지 같아야 ON CONFLICT가 그 인덱스를 찾는다 */
const COMPENSATION_COUPON = sql`reason = 'owner_fault_compensation'`;

export type OwnerFaultExtras = {
  /** 손님이 쓴 쿠폰을 돌려줬는지 */
  couponReturned: boolean;
};

/**
 * 원장님 귀책 취소의 나머지 기록(11/15 nnoinn):
 * 1. 손님이 쓴 쿠폰을 돌려준다(쓴 주문·시각을 비운다, 기한은 원래 그대로)
 * 2. 손님에게 보상 쿠폰 OWNER_FAULT_COUPON_AMOUNT원(COUPON_VALID_DAYS일)을 준다
 * 3. 샵에 패널티 OWNER_FAULT_PENALTY_AMOUNT원을 남긴다(목요일 정산 묶기가 아직 지급하지 않은 정산금에서 뗀다)
 * 4. 답을 기다리는 합의 후 취소 요청이 있으면 닫는다(closed)
 */
export async function recordOwnerFaultExtras(
  tx: Tx,
  input: { reservationId: string; orderId: string; now: Date },
): Promise<OwnerFaultExtras> {
  const [target] = await tx
    .select({
      customerId: reservations.customerId,
      shopId: slots.shopId,
      couponId: orders.couponId,
    })
    .from(reservations)
    .innerJoin(orders, eq(orders.id, reservations.orderId))
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .where(eq(reservations.id, input.reservationId));
  if (!target) throw new Error(`원장님 귀책 취소할 예약이 없어요: ${input.reservationId}`);

  let couponReturned = false;
  if (target.couponId) {
    const returned = await tx
      .update(coupons)
      .set({ usedOrderId: null, usedAt: null })
      .where(and(eq(coupons.id, target.couponId), eq(coupons.usedOrderId, input.orderId)))
      .returning({ id: coupons.id });
    couponReturned = returned.length > 0;
  }

  await tx
    .insert(coupons)
    .values({
      customerId: target.customerId,
      amount: OWNER_FAULT_COUPON_AMOUNT,
      reason: 'owner_fault_compensation',
      sourceReservationId: input.reservationId,
      issuedAt: input.now,
      expiresAt: new Date(input.now.getTime() + COUPON_VALID_DAYS * DAY_MS),
    })
    .onConflictDoNothing({ target: coupons.sourceReservationId, where: COMPENSATION_COUPON });

  await tx
    .insert(ownerPenalties)
    .values({
      shopId: target.shopId,
      reservationId: input.reservationId,
      amount: OWNER_FAULT_PENALTY_AMOUNT,
      createdAt: input.now,
    })
    .onConflictDoNothing({ target: ownerPenalties.reservationId });

  await tx
    .update(agreedCancelRequests)
    .set({ status: 'closed', respondedAt: input.now })
    .where(
      and(
        eq(agreedCancelRequests.reservationId, input.reservationId),
        eq(agreedCancelRequests.status, 'requested'),
      ),
    );

  return { couponReturned };
}
