// 합의 후 취소: DB 읽기·저장 (X-208, #301, #320). 서버에서만 부른다. 내 예약·내 샵 예약인지와 상태 판단은 agreed-cancel.ts·rules가 한다.
// 만료는 상태를 바꾸기 전이라도 expires_at으로 판단한다(#320 리뷰). 저장된 'requested'를 'expired'로 바꾸는 것은
// 원장님이 다시 요청할 때(같은 트랜잭션)와 5분마다 도는 작업(agreed-cancel-expiry.ts)이다.

import 'server-only';

import { and, desc, eq, gt, inArray, isNotNull, lte, ne, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import { agreedCancelRequests, orders, reservations, slots } from '@/db/schema';
import type { ReservationStatus, VisitResult } from '@/db/schema/payments';
import type { AgreedCancelRequestStatus } from '@/db/schema/refunds';

import type { AgreedCancelReason } from './agreed-cancel-types';

type Db = ReturnType<typeof getDb>;
type DbReader = Pick<Db, 'select'>;
type DbWriter = Pick<Db, 'select' | 'insert' | 'update'>;

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

/** 저장된 요청 한 건 */
export type AgreedCancelRequestRow = {
  requestId: string;
  reservationId: string;
  reason: AgreedCancelReason;
  reasonText: string | null;
  status: AgreedCancelRequestStatus;
  requestedAt: Date;
  expiresAt: Date;
  respondedAt: Date | null;
};

const targetColumns = {
  reservationId: reservations.id,
  customerId: reservations.customerId,
  shopId: slots.shopId,
  status: reservations.status,
  visitResult: reservations.visitResult,
  startAt: slots.startAt,
  salePrice: orders.salePrice,
  paidAmount: orders.amount,
  couponAmount: orders.couponAmount,
};

function toTarget(
  row: Omit<AgreedCancelTarget, 'status' | 'visitResult'> & {
    status: string;
    visitResult: string | null;
  },
): AgreedCancelTarget {
  // DB의 check 제약이 정해진 값만 허용한다
  return {
    ...row,
    status: row.status as ReservationStatus,
    visitResult: row.visitResult as VisitResult | null,
  };
}

/** 예약 하나의 합의 후 취소 값. 없으면 null. lock이면 예약 줄을 잠근다(트랜잭션 안에서, 요청이 동시에 두 번 들어와도 한 번만) */
export async function readAgreedCancelTarget(
  db: DbReader,
  reservationId: string,
  { lock = false }: { lock?: boolean } = {},
): Promise<AgreedCancelTarget | null> {
  const query = db
    .select(targetColumns)
    .from(reservations)
    .innerJoin(orders, eq(orders.id, reservations.orderId))
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .where(eq(reservations.id, reservationId));
  const [row] = lock ? await query.for('update', { of: reservations }) : await query;
  return row ? toTarget(row) : null;
}

const requestColumns = {
  requestId: agreedCancelRequests.id,
  reservationId: agreedCancelRequests.reservationId,
  reason: agreedCancelRequests.reason,
  reasonText: agreedCancelRequests.reasonText,
  status: agreedCancelRequests.status,
  requestedAt: agreedCancelRequests.requestedAt,
  expiresAt: agreedCancelRequests.expiresAt,
  respondedAt: agreedCancelRequests.respondedAt,
};

function toRequest(
  row: Omit<AgreedCancelRequestRow, 'reason' | 'status'> & {
    reason: string;
    status: string;
  },
): AgreedCancelRequestRow {
  return {
    ...row,
    reason: row.reason as AgreedCancelReason,
    status: row.status as AgreedCancelRequestStatus,
  };
}

/** 그 예약의 가장 최근 요청. 없으면 null */
export async function readLatestAgreedCancelRequest(
  db: DbReader,
  reservationId: string,
): Promise<AgreedCancelRequestRow | null> {
  const [row] = await db
    .select(requestColumns)
    .from(agreedCancelRequests)
    .where(eq(agreedCancelRequests.reservationId, reservationId))
    .orderBy(desc(agreedCancelRequests.requestedAt))
    .limit(1);
  return row ? toRequest(row) : null;
}

/** 요청 한 건과 그 예약. 없으면 null */
export async function readAgreedCancelRequest(
  db: DbReader,
  requestId: string,
): Promise<{ request: AgreedCancelRequestRow; target: AgreedCancelTarget } | null> {
  const [row] = await db
    .select({ ...requestColumns, target: targetColumns })
    .from(agreedCancelRequests)
    .innerJoin(reservations, eq(reservations.id, agreedCancelRequests.reservationId))
    .innerJoin(orders, eq(orders.id, reservations.orderId))
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .where(eq(agreedCancelRequests.id, requestId));
  if (!row) return null;
  const { target, ...request } = row;
  return { request: toRequest(request), target: toTarget(target) };
}

/**
 * 그 예약에서 만료 시각이 지난 '답 기다림' 요청을 '만료'로 바꾼다(응답 시각 = 만료 시각). 트랜잭션 안에서 부른다.
 * 원장님이 다시 요청할 때 새 요청을 넣기 전에 부른다(#320 리뷰)
 */
export async function expireReservationRequests(
  tx: Pick<Db, 'update'>,
  input: { reservationId: string; now: Date },
): Promise<void> {
  await tx
    .update(agreedCancelRequests)
    .set({ status: 'expired', respondedAt: sql`${agreedCancelRequests.expiresAt}` })
    .where(
      and(
        eq(agreedCancelRequests.reservationId, input.reservationId),
        eq(agreedCancelRequests.status, 'requested'),
        lte(agreedCancelRequests.expiresAt, input.now),
      ),
    );
}

/** 새 요청을 '답 기다림'으로 저장한다. 답을 기다리는 요청이 이미 있으면 unique(agreed_cancel_requests_pending_unique)가 막는다 */
export async function insertAgreedCancelRequest(
  tx: Pick<Db, 'insert'>,
  input: {
    reservationId: string;
    requestedBy: string;
    reason: AgreedCancelReason;
    reasonText: string | null;
    requestedAt: Date;
    expiresAt: Date;
  },
): Promise<{ requestId: string }> {
  const [row] = await tx
    .insert(agreedCancelRequests)
    .values({ ...input, status: 'requested' })
    .returning({ requestId: agreedCancelRequests.id });
  return row;
}

/** 예약이 아직 합의 후 취소 대상인지(예정이고 방문·노쇼 처리 전). 거절·동의를 저장하는 조건에 같이 쓴다 */
const reservationStillTarget = sql`exists (select 1 from ${reservations} where ${reservations.id} = ${agreedCancelRequests.reservationId} and ${reservations.status} = 'confirmed' and ${reservations.visitResult} is null)`;

/**
 * 손님 [동의하지 않아요]. 답을 기다리고, 만료 전이고, 예약이 그대로일 때만 '거절'로 바꾼다. 바꿨으면 true
 * (동시에 두 번 눌러도, 그 사이 만료되거나 예약이 바뀌어도 한 번만 바뀐다)
 */
export async function declineAgreedCancelRequest(
  db: Pick<Db, 'update'>,
  input: { requestId: string; now: Date },
): Promise<boolean> {
  const updated = await db
    .update(agreedCancelRequests)
    .set({ status: 'declined', respondedAt: input.now })
    .where(
      and(
        eq(agreedCancelRequests.id, input.requestId),
        eq(agreedCancelRequests.status, 'requested'),
        gt(agreedCancelRequests.expiresAt, input.now),
        reservationStillTarget,
      ),
    )
    .returning({ id: agreedCancelRequests.id });
  return updated.length > 0;
}

/**
 * 5분마다 도는 작업: 만료 시각이 지난 '답 기다림' 요청을 '만료'로 바꾸고, 바꾼 요청(원장님 알림용)을 돌려준다.
 * 한 번에 limit개까지(오래된 것부터). 남은 것은 다음 실행이 바꾼다
 */
export async function expireDueRequests(
  db: DbWriter,
  input: { now: Date; limit: number },
): Promise<{ requestId: string; reservationId: string }[]> {
  const due = db
    .select({ id: agreedCancelRequests.id })
    .from(agreedCancelRequests)
    .where(
      and(
        eq(agreedCancelRequests.status, 'requested'),
        lte(agreedCancelRequests.expiresAt, input.now),
      ),
    )
    .orderBy(agreedCancelRequests.expiresAt)
    .limit(input.limit);
  return db
    .update(agreedCancelRequests)
    .set({ status: 'expired', respondedAt: sql`${agreedCancelRequests.expiresAt}` })
    .where(and(inArray(agreedCancelRequests.id, due), eq(agreedCancelRequests.status, 'requested')))
    .returning({
      requestId: agreedCancelRequests.id,
      reservationId: agreedCancelRequests.reservationId,
    });
}

/**
 * 5분마다 도는 작업: 손님이 답하기 전에 예약이 바뀐(취소됐거나 방문·노쇼 처리된) '답 기다림' 요청을 '끝남'으로 바꾼다.
 * 알림은 보내지 않는다(원장님은 취소·방문 처리를 이미 안다). 바꾼 수를 돌려준다
 */
export async function closeChangedRequests(
  db: Pick<Db, 'update'>,
  input: { now: Date },
): Promise<number> {
  const closed = await db
    .update(agreedCancelRequests)
    .set({ status: 'closed', respondedAt: input.now })
    .where(
      and(
        eq(agreedCancelRequests.status, 'requested'),
        sql`exists (select 1 from ${reservations} where ${reservations.id} = ${agreedCancelRequests.reservationId} and (${ne(reservations.status, 'confirmed')} or ${isNotNull(reservations.visitResult)}))`,
      ),
    )
    .returning({ id: agreedCancelRequests.id });
  return closed.length;
}

/**
 * 손님 [동의하고 취소할게요]. 답을 기다리고, 만료 전이고, 예약이 그대로일 때만 '동의'로 바꾼다. 트랜잭션 안에서
 * 진행 중 환불 기록과 같이 부른다. 바꿨으면 true(동시에 두 번 눌러도 한 번만)
 */
export async function markAgreedCancelRequest(
  tx: Pick<Db, 'update'>,
  input: { requestId: string; now: Date },
): Promise<boolean> {
  const updated = await tx
    .update(agreedCancelRequests)
    .set({ status: 'agreed', respondedAt: input.now })
    .where(
      and(
        eq(agreedCancelRequests.id, input.requestId),
        eq(agreedCancelRequests.status, 'requested'),
        gt(agreedCancelRequests.expiresAt, input.now),
        reservationStillTarget,
      ),
    )
    .returning({ id: agreedCancelRequests.id });
  return updated.length > 0;
}

/**
 * 동의했지만 돌려준 돈이 없을 때(결제사 거절 등) 그 예약의 '동의' 요청을 다시 '답 기다림'으로 돌린다.
 * 그 사이 만료 시각이 지났으면 '만료'로 둔다(응답 시각 = 만료 시각). 손님은 기한 안이면 다시 동의할 수 있다
 */
export async function reopenAgreedRequest(
  db: Pick<Db, 'update'>,
  input: { reservationId: string; now: Date },
): Promise<void> {
  // gt()로 비교해야 시각이 컬럼 형식으로 바뀐다(sql``에 Date를 바로 넣으면 드라이버가 받지 못한다)
  const stillOpen = gt(agreedCancelRequests.expiresAt, input.now);
  await db
    .update(agreedCancelRequests)
    .set({
      status: sql`case when ${stillOpen} then 'requested' else 'expired' end`,
      respondedAt: sql`case when ${stillOpen} then null else ${agreedCancelRequests.expiresAt} end`,
    })
    .where(
      and(
        eq(agreedCancelRequests.reservationId, input.reservationId),
        eq(agreedCancelRequests.status, 'agreed'),
      ),
    );
}
