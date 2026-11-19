// 매물·예약 조회 (A-103, W18). 운영자 화면에서만 쓰는 서버 코드라 화면 폴더에 둔다.
// 화면(page)이 ensureAdminPage()로 관리자를 확인한 뒤 부른다. db를 받아서 테스트(withRollback)에서 tx를 넘길 수 있다.
// 조회만 한다. 고객은 닉네임만 읽고, 연락처는 회원 조회에서 본다.

import 'server-only';

import { and, asc, desc, eq, ilike, or, type SQL, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import {
  adminActions,
  adminProfiles,
  customers,
  type DisputeOutcome,
  disputes,
  type DisputeStatus,
  orders,
  refunds,
  type ReservationStatus,
  reservations,
  shops,
  settlementItems,
  type SlotStatus,
  slots,
  type VisitResult,
} from '@/db/schema';
import { slotStatusIs } from '@/features/slot-status/slot-status-sql';
import { ownerListedSlot } from '@/server/slots/visibility';

import { ADMIN_LIST_LIMIT, containsPattern, type ListResult, toListResult } from '../lookup';
import type { ReservationFilter, ReservationSort, SlotFilter } from './format';

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

/** 예약 목록 정렬(#360 1번). 같은 시각이면 예약번호 순으로 늘 같은 순서가 되게 한다 */
const RESERVATION_ORDER: Record<ReservationSort, SQL[]> = {
  latest: [desc(reservations.createdAt), asc(reservations.code)],
  oldest: [asc(reservations.createdAt), asc(reservations.code)],
  start_soon: [asc(slots.startAt), asc(reservations.code)],
  start_late: [desc(slots.startAt), asc(reservations.code)],
};

export type ReservationRow = {
  reservationId: string;
  /** 예약한 시각(예약이 만들어진 때). 목록 첫 칸 */
  bookedAt: Date;
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

/** 예약 목록(기본은 최근에 예약한 것부터, sort로 바꾼다). 예약번호·샵 이름·고객 닉네임 일부로 찾는다 */
export async function selectReservations(
  db: DbReader,
  input: { filter: ReservationFilter; query: string; sort?: ReservationSort },
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
      bookedAt: reservations.createdAt,
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
    .orderBy(...RESERVATION_ORDER[input.sort ?? 'latest'])
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
  /** 손님이 시간대 매물 안에서 만든 칸이면 그 시간대(목록에는 결제가 끝난 칸만 나온다) */
  windowId: string | null;
};

/**
 * 매물 목록(시작 시각이 늦은 순). 샵 이름·메뉴 이름 일부로 찾는다. 상태는 지금 시각으로 계산한 상태로 거른다.
 * 손님이 시간대 안에서 만들었다가 결제 없이 비운 칸(hold_released)과 아직 결제 중인 시간대 칸은 어느 상태로 걸러도
 * 보이지 않는다(#308 ③④, ownerListedSlot). 결제가 끝난 시간대 칸은 예약으로 보인다
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
      windowId: slots.windowId,
    })
    .from(slots)
    .innerJoin(shops, eq(shops.id, slots.shopId))
    .where(and(ownerListedSlot(), status, search))
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
  /** 예약 무효 시각(A-108). 무효가 아니면 null */
  voidedAt: Date | null;
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
  /** 정산에 묶였는지(정산 줄이 있다). 묶인 뒤에는 노쇼를 되돌리지 않는다(#373 ③, 11/16) */
  settlementBundled: boolean;
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
      voidedAt: reservations.voidedAt,
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
      orderId: orders.id,
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

  const [bundled] = await db
    .select({ id: settlementItems.id })
    .from(settlementItems)
    .where(eq(settlementItems.orderId, row.orderId))
    .limit(1);

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
    settlementBundled: Boolean(bundled),
  };
}

export type SlotDetail = {
  slotId: string;
  shopId: string;
  shopName: string;
  serviceType: string;
  menuName: string;
  menuDescription: string | null;
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  listPrice: number;
  discountRate: number;
  salePrice: number;
  newCustomerOnly: boolean;
  publishAt: Date;
  status: SlotStatus;
  holdCustomerId: string | null;
  holdExpiresAt: Date | null;
  closedAt: Date | null;
  closeReason: string | null;
  /** 손님이 시간대 매물 안에서 만든 칸이면 그 시간대 */
  windowId: string | null;
  /** 취소된 매물을 재등록한 것이면 원래 매물 */
  relistedFromSlotId: string | null;
  createdAt: Date;
  /** 이 매물의 예약(예약한 순서). 고객 정보는 읽지 않는다 */
  reservations: {
    reservationId: string;
    code: string;
    status: ReservationStatus;
    visitResult: VisitResult | null;
    bookedAt: Date;
  }[];
  /** 이 매물에 남은 운영자 처리 기록(최근 것부터). 이름을 정하지 않은 운영자는 null */
  adminActions: { action: string; memo: string | null; at: Date; adminName: string | null }[];
};

/**
 * 매물 상세(A-103, 11/19 운영자 화면 피드백). 없으면 null.
 * 목록에서 빼는 매물(결제 없이 비운 시간대 칸 등)도 주소로 들어오면 보여 준다(운영자 기록에서 들어올 수 있다)
 */
export async function selectSlotDetail(db: DbReader, slotId: string): Promise<SlotDetail | null> {
  const [row] = await db
    .select({
      slotId: slots.id,
      shopId: shops.id,
      shopName: shops.name,
      serviceType: slots.serviceType,
      menuName: slots.menuName,
      menuDescription: slots.menuDescription,
      startAt: slots.startAt,
      endAt: slots.endAt,
      durationMinutes: slots.durationMinutes,
      listPrice: slots.listPrice,
      discountRate: slots.discountRate,
      salePrice: slots.salePrice,
      newCustomerOnly: slots.newCustomerOnly,
      publishAt: slots.publishAt,
      status: slots.status,
      holdCustomerId: slots.holdCustomerId,
      holdExpiresAt: slots.holdExpiresAt,
      closedAt: slots.closedAt,
      closeReason: slots.closeReason,
      windowId: slots.windowId,
      relistedFromSlotId: slots.relistedFromSlotId,
      createdAt: slots.createdAt,
    })
    .from(slots)
    .innerJoin(shops, eq(shops.id, slots.shopId))
    .where(eq(slots.id, slotId));
  if (!row) return null;

  const [reservationRows, actionRows] = await Promise.all([
    db
      .select({
        reservationId: reservations.id,
        code: reservations.code,
        status: reservations.status,
        visitResult: reservations.visitResult,
        bookedAt: reservations.createdAt,
      })
      .from(reservations)
      .where(eq(reservations.slotId, slotId))
      .orderBy(asc(reservations.createdAt), asc(reservations.code)),
    db
      .select({
        action: adminActions.action,
        memo: adminActions.memo,
        at: adminActions.createdAt,
        adminName: adminProfiles.name,
      })
      .from(adminActions)
      .leftJoin(adminProfiles, eq(adminProfiles.userId, adminActions.adminId))
      .where(and(eq(adminActions.targetType, 'slot'), eq(adminActions.targetId, slotId)))
      .orderBy(desc(adminActions.createdAt), asc(adminActions.id)),
  ]);

  return {
    ...row,
    // DB의 check 제약이 정해 둔 값만 허용한다
    status: row.status as SlotStatus,
    reservations: reservationRows.map((reservation) => ({
      ...reservation,
      status: reservation.status as ReservationStatus,
      visitResult: reservation.visitResult as VisitResult | null,
    })),
    adminActions: actionRows,
  };
}
