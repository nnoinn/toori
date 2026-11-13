// 매물·예약 조회 (A-103, W18). 운영자 화면에서만 쓰는 서버 코드라 화면 폴더에 둔다.
// 화면(page)이 ensureAdminPage()로 관리자를 확인한 뒤 부른다. db를 받아서 테스트(withRollback)에서 tx를 넘길 수 있다.
// 조회만 한다. 고객은 닉네임만 읽고, 연락처는 회원 조회에서 본다.

import 'server-only';

import { and, asc, desc, eq, ilike, or, type SQL, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import {
  customers,
  type DisputeOutcome,
  disputes,
  type DisputeStatus,
  orders,
  refunds,
  type ReservationStatus,
  reservations,
  shops,
  type SlotStatus,
  slots,
  type VisitResult,
} from '@/db/schema';
import { slotStatusIs } from '@/features/slot-status/slot-status-sql';
import { notHoldReleasedSlot } from '@/server/slots/visibility';

import { ADMIN_LIST_LIMIT, containsPattern, type ListResult, toListResult } from '../lookup';
import type { ReservationFilter, SlotFilter } from './format';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

/** 운영자 확인 이유가 남은 환불이 있는 예약(W14, #222) */
const needsReview = sql<boolean>`exists (
  select 1 from ${refunds}
  where ${refunds.reservationId} = ${reservations.id} and ${refunds.reviewReason} is not null
)`;

const RESERVATION_CONDITIONS: Record<ReservationFilter, SQL | undefined> = {
  all: undefined,
  confirmed: eq(reservations.status, 'confirmed'),
  completed: and(eq(reservations.status, 'completed'), eq(reservations.visitResult, 'visited')),
  no_show: eq(reservations.visitResult, 'no_show'),
  cancelled: eq(reservations.status, 'cancelled'),
  review: needsReview,
};

export type ReservationRow = {
  reservationId: string;
  code: string;
  status: ReservationStatus;
  visitResult: VisitResult | null;
  shopName: string;
  menuName: string;
  customerNickname: string;
  startAt: Date;
  amount: number;
  needsReview: boolean;
};

/** 예약 목록(시작 시각이 늦은 순). 예약번호·샵 이름·고객 닉네임 일부로 찾는다 */
export async function selectReservations(
  db: DbReader,
  input: { filter: ReservationFilter; query: string },
): Promise<ListResult<ReservationRow>> {
  const pattern = containsPattern(input.query);
  const search: SQL | undefined = input.query
    ? or(
        ilike(reservations.code, pattern),
        ilike(shops.name, pattern),
        ilike(customers.nickname, pattern),
      )
    : undefined;
  const rows = await db
    .select({
      reservationId: reservations.id,
      code: reservations.code,
      status: reservations.status,
      visitResult: reservations.visitResult,
      shopName: shops.name,
      menuName: slots.menuName,
      customerNickname: customers.nickname,
      startAt: slots.startAt,
      amount: orders.amount,
      needsReview,
    })
    .from(reservations)
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .innerJoin(shops, eq(shops.id, slots.shopId))
    .innerJoin(customers, eq(customers.id, reservations.customerId))
    .innerJoin(orders, eq(orders.id, reservations.orderId))
    .where(and(RESERVATION_CONDITIONS[input.filter], search))
    .orderBy(desc(slots.startAt), asc(reservations.code))
    .limit(ADMIN_LIST_LIMIT + 1);
  // DB의 check 제약이 정해 둔 값만 허용한다
  return toListResult(
    rows.map((row) => ({
      ...row,
      status: row.status as ReservationStatus,
      visitResult: row.visitResult as VisitResult | null,
    })),
  );
}

export type SlotRow = {
  slotId: string;
  shopId: string;
  shopName: string;
  menuName: string;
  startAt: Date;
  publishAt: Date;
  listPrice: number;
  discountRate: number;
  salePrice: number;
  newCustomerOnly: boolean;
  /** DB에 저장된 상태. 화면에는 getSlotStatus로 계산한 상태를 보여준다 */
  status: SlotStatus;
  holdCustomerId: string | null;
  holdExpiresAt: Date | null;
};

/**
 * 매물 목록(시작 시각이 늦은 순). 샵 이름·메뉴 이름 일부로 찾는다. 상태는 지금 시각으로 계산한 상태로 거른다.
 * 손님이 시간대 안에서 만들었다가 결제 없이 비운 칸(hold_released)은 어느 상태로 걸러도 보이지 않는다(#308 ④)
 */
export async function selectSlots(
  db: DbReader,
  input: { filter: SlotFilter; query: string; now: Date },
): Promise<ListResult<SlotRow>> {
  const pattern = containsPattern(input.query);
  const search: SQL | undefined = input.query
    ? or(ilike(shops.name, pattern), ilike(slots.menuName, pattern))
    : undefined;
  const status = input.filter === 'all' ? undefined : slotStatusIs(input.filter, input.now);
  const rows = await db
    .select({
      slotId: slots.id,
      shopId: shops.id,
      shopName: shops.name,
      menuName: slots.menuName,
      startAt: slots.startAt,
      publishAt: slots.publishAt,
      listPrice: slots.listPrice,
      discountRate: slots.discountRate,
      salePrice: slots.salePrice,
      newCustomerOnly: slots.newCustomerOnly,
      status: slots.status,
      holdCustomerId: slots.holdCustomerId,
      holdExpiresAt: slots.holdExpiresAt,
    })
    .from(slots)
    .innerJoin(shops, eq(shops.id, slots.shopId))
    .where(and(notHoldReleasedSlot(), status, search))
    .orderBy(desc(slots.startAt), asc(slots.id))
    .limit(ADMIN_LIST_LIMIT + 1);
  // DB의 check 제약이 6가지 상태만 허용한다
  return toListResult(rows.map((row) => ({ ...row, status: row.status as SlotStatus })));
}

export type RefundRow = {
  refundId: string;
  reason: string;
  status: string;
  band: string | null;
  penaltyRate: number;
  refundAmount: number;
  penaltyAmount: number;
  pgCancellationId: string | null;
  reviewReason: string | null;
  processedAt: Date | null;
};

export type ReservationDetail = {
  reservationId: string;
  code: string;
  status: ReservationStatus;
  visitResult: VisitResult | null;
  visitRecordedAt: Date | null;
  cancelledAt: Date | null;
  cancelActor: string | null;
  cancelReason: string | null;
  hoursBeforeStartAtCancel: number | null;
  createdAt: Date;
  customerNickname: string;
  shopId: string;
  shopName: string;
  menuName: string;
  startAt: Date;
  paymentId: string;
  orderStatus: string;
  pgStatus: string | null;
  payMethod: string | null;
  paidAt: Date | null;
  salePrice: number;
  couponAmount: number;
  amount: number;
  refunds: RefundRow[];
  /** 이 예약의 이의제기(한 예약에 하나). 없으면 null. 있으면 [이의제기 등록] 대신 그 상세로 보낸다 */
  dispute: { disputeId: string; status: DisputeStatus; outcome: DisputeOutcome | null } | null;
};

/** 예약 상세. 없으면 null */
export async function selectReservationDetail(
  db: DbReader,
  reservationId: string,
): Promise<ReservationDetail | null> {
  const [row] = await db
    .select({
      reservationId: reservations.id,
      code: reservations.code,
      status: reservations.status,
      visitResult: reservations.visitResult,
      visitRecordedAt: reservations.visitRecordedAt,
      cancelledAt: reservations.cancelledAt,
      cancelActor: reservations.cancelActor,
      cancelReason: reservations.cancelReason,
      hoursBeforeStartAtCancel: reservations.hoursBeforeStartAtCancel,
      createdAt: reservations.createdAt,
      customerNickname: customers.nickname,
      shopId: shops.id,
      shopName: shops.name,
      menuName: slots.menuName,
      startAt: slots.startAt,
      paymentId: orders.paymentId,
      orderStatus: orders.status,
      pgStatus: orders.pgStatus,
      payMethod: orders.payMethod,
      paidAt: orders.paidAt,
      salePrice: orders.salePrice,
      couponAmount: orders.couponAmount,
      amount: orders.amount,
    })
    .from(reservations)
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .innerJoin(shops, eq(shops.id, slots.shopId))
    .innerJoin(customers, eq(customers.id, reservations.customerId))
    .innerJoin(orders, eq(orders.id, reservations.orderId))
    .where(eq(reservations.id, reservationId));
  if (!row) return null;

  const refundRows = await db
    .select({
      refundId: refunds.id,
      reason: refunds.reason,
      status: refunds.status,
      band: refunds.band,
      penaltyRate: refunds.penaltyRate,
      refundAmount: refunds.refundAmount,
      penaltyAmount: refunds.penaltyAmount,
      pgCancellationId: refunds.pgCancellationId,
      reviewReason: refunds.reviewReason,
      processedAt: refunds.processedAt,
    })
    .from(refunds)
    .where(eq(refunds.reservationId, reservationId))
    .orderBy(asc(refunds.createdAt));

  const [dispute] = await db
    .select({ disputeId: disputes.id, status: disputes.status, outcome: disputes.outcome })
    .from(disputes)
    .where(eq(disputes.reservationId, reservationId));

  return {
    ...row,
    // DB의 check 제약이 정해 둔 값만 허용한다
    status: row.status as ReservationStatus,
    visitResult: row.visitResult as VisitResult | null,
    refunds: refundRows,
    dispute: dispute
      ? {
          disputeId: dispute.disputeId,
          status: dispute.status as DisputeStatus,
          outcome: dispute.outcome as DisputeOutcome | null,
        }
      : null,
  };
}
