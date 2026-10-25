// 내 예약 목록·상세 조회 (J12, C-501·C-502). 이 화면에서만 쓰는 서버 코드라 화면 폴더에 둔다.
// 본인 예약만 본다(X-102). 화면에서 부르는 함수는 첫 줄에서 requireCustomer로 확인한다.
// select…는 DB를 받아서 테스트(withRollback)에서도 같은 조회를 쓸 수 있게 했다.

import 'server-only';

import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@/db';
import { orders, refunds, reservations, shops, slots } from '@/db/schema';
import type { Result } from '@/lib/result';
import { fail, ok } from '@/lib/result';
import { requireCustomer } from '@/server/auth';

import { statusOfTab, type ReservationTab } from './reservation-tabs';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

export type MyReservationItem = {
  reservationId: string;
  code: string;
  shopName: string;
  menuName: string;
  /** ISO */
  startAt: string;
  /** 실제 결제액 */
  amount: number;
  noShow: boolean;
  /** 취소 시각(ISO). 취소 탭에서만 */
  cancelledAt: string | null;
};

export type MyReservationDetail = MyReservationItem & {
  status: 'confirmed' | 'completed' | 'cancelled';
  shop: { name: string; roadAddress: string; addressDetail: string | null; phone: string };
  durationMinutes: number;
  payment: {
    salePrice: number;
    couponAmount: number;
    amount: number;
    /** ISO */
    paidAt: string | null;
  };
  refund: {
    refundAmount: number;
    penaltyAmount: number;
    penaltyRate: number;
    /** ISO */
    processedAt: string;
  } | null;
};

const iso = (date: Date | null) => (date ? date.toISOString() : null);

/** 그 고객의 한 탭 예약. 예정은 가까운 순, 이용 완료는 최근 이용 순, 취소는 최근 취소 순 */
export async function selectMyReservations(
  db: DbReader,
  customerId: string,
  tab: ReservationTab,
): Promise<MyReservationItem[]> {
  const order =
    tab === 'upcoming'
      ? [asc(slots.startAt)]
      : tab === 'completed'
        ? [desc(slots.startAt)]
        : [desc(reservations.cancelledAt)];

  const rows = await db
    .select({
      reservationId: reservations.id,
      code: reservations.code,
      visitResult: reservations.visitResult,
      cancelledAt: reservations.cancelledAt,
      shopName: shops.name,
      menuName: slots.menuName,
      startAt: slots.startAt,
      amount: orders.amount,
    })
    .from(reservations)
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .innerJoin(shops, eq(shops.id, slots.shopId))
    .innerJoin(orders, eq(orders.id, reservations.orderId))
    .where(and(eq(reservations.customerId, customerId), eq(reservations.status, statusOfTab(tab))))
    .orderBy(...order, asc(reservations.id));

  return rows.map((row) => ({
    reservationId: row.reservationId,
    code: row.code,
    shopName: row.shopName,
    menuName: row.menuName,
    startAt: row.startAt.toISOString(),
    amount: row.amount,
    noShow: row.visitResult === 'no_show',
    cancelledAt: iso(row.cancelledAt),
  }));
}

/** 그 고객의 예약 하나. 다른 고객 예약이거나 없으면 null */
export async function selectMyReservationDetail(
  db: DbReader,
  customerId: string,
  reservationId: string,
): Promise<MyReservationDetail | null> {
  const [row] = await db
    .select({
      reservationId: reservations.id,
      code: reservations.code,
      status: reservations.status,
      visitResult: reservations.visitResult,
      cancelledAt: reservations.cancelledAt,
      shopName: shops.name,
      roadAddress: shops.roadAddress,
      addressDetail: shops.addressDetail,
      phone: shops.phone,
      menuName: slots.menuName,
      startAt: slots.startAt,
      durationMinutes: slots.durationMinutes,
      salePrice: orders.salePrice,
      couponAmount: orders.couponAmount,
      amount: orders.amount,
      paidAt: orders.paidAt,
    })
    .from(reservations)
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .innerJoin(shops, eq(shops.id, slots.shopId))
    .innerJoin(orders, eq(orders.id, reservations.orderId))
    .where(and(eq(reservations.id, reservationId), eq(reservations.customerId, customerId)))
    .limit(1);
  if (!row) return null;

  // 환불은 예약 하나에 보통 하나다. 여러 개면 가장 최근 것
  const [refund] = await db
    .select({
      refundAmount: refunds.refundAmount,
      penaltyAmount: refunds.penaltyAmount,
      penaltyRate: refunds.penaltyRate,
      processedAt: refunds.processedAt,
    })
    .from(refunds)
    .where(eq(refunds.reservationId, row.reservationId))
    .orderBy(desc(refunds.processedAt))
    .limit(1);

  return {
    reservationId: row.reservationId,
    code: row.code,
    status: row.status as MyReservationDetail['status'],
    shopName: row.shopName,
    menuName: row.menuName,
    startAt: row.startAt.toISOString(),
    amount: row.amount,
    noShow: row.visitResult === 'no_show',
    cancelledAt: iso(row.cancelledAt),
    shop: {
      name: row.shopName,
      roadAddress: row.roadAddress,
      addressDetail: row.addressDetail,
      phone: row.phone,
    },
    durationMinutes: row.durationMinutes,
    payment: {
      salePrice: row.salePrice,
      couponAmount: row.couponAmount,
      amount: row.amount,
      paidAt: iso(row.paidAt),
    },
    refund: refund
      ? {
          refundAmount: refund.refundAmount,
          penaltyAmount: refund.penaltyAmount,
          penaltyRate: refund.penaltyRate,
          processedAt: refund.processedAt.toISOString(),
        }
      : null,
  };
}

/** 화면용: 지금 들어온 고객의 한 탭 예약 */
export async function getMyReservations(tab: ReservationTab): Promise<Result<MyReservationItem[]>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  return ok(await selectMyReservations(getDb(), auth.data.customerId, tab));
}

const reservationIdSchema = z.uuid();

/** 화면용: 지금 들어온 고객의 예약 하나. 주소가 이상하거나 본인 예약이 아니면 NOT_FOUND */
export async function getMyReservationDetail(
  reservationId: string,
): Promise<Result<MyReservationDetail>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  if (!reservationIdSchema.safeParse(reservationId).success) {
    return fail('NOT_FOUND', '예약을 찾을 수 없어요');
  }
  const detail = await selectMyReservationDetail(getDb(), auth.data.customerId, reservationId);
  return detail ? ok(detail) : fail('NOT_FOUND', '예약을 찾을 수 없어요');
}
