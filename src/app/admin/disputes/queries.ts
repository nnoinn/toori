// 운영자 이의제기 화면(A-104, W19 ②)의 조회. 이 화면에서만 쓴다(목록·상세). 처리(등록·결론)는 '@/server/disputes/admin'.
// 고객 연락처는 읽지 않는다(#360 4번). 내용(content)·메모는 고객·운영자가 쓴 글이라 로그에 남기지 않는다.
// 이의제기는 그 예약의 손님만 신청한다(11/13 nnoinn, DISPUTE-08). 그래서 신청한 사람은 늘 그 예약의 손님이다.
// 손님은 예약자 이름(#375)으로 보여주고 찾는다. 닉네임으로도 찾을 수 있다

import 'server-only';

import { and, asc, desc, eq, ilike, or, type SQL } from 'drizzle-orm';

import type { getDb } from '@/db';
import {
  customers,
  type DisputeChannel,
  type DisputeOutcome,
  disputes,
  type DisputeStatus,
  type DisputeType,
  reservations,
  type ReservationStatus,
  shops,
  slots,
  type VisitResult,
} from '@/db/schema';

import { ADMIN_LIST_LIMIT, containsPattern, type ListResult, toListResult } from '../lookup';
import type { DisputeFilter } from './format';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

/** 목록 한 줄 */
export type DisputeRow = {
  disputeId: string;
  receivedAt: Date;
  channel: DisputeChannel;
  type: DisputeType;
  status: DisputeStatus;
  outcome: DisputeOutcome | null;
  handledAt: Date | null;
  reservationId: string;
  reservationCode: string;
  shopName: string;
  /** 신청한 손님(그 예약의 손님)과 그 예약자 이름 */
  customerId: string;
  customerName: string;
};

const ORDER: Record<DisputeFilter, SQL[]> = {
  // 확인 중은 오래 기다린 것부터(정산 보류가 길어지지 않게)
  open: [asc(disputes.receivedAt), asc(disputes.id)],
  resolved: [desc(disputes.handledAt), desc(disputes.id)],
  all: [desc(disputes.receivedAt), desc(disputes.id)],
};

/** 이의제기 목록. 검색어는 예약번호·샵 이름·손님 이름·닉네임 */
export async function selectDisputes(
  db: DbReader,
  input: { filter: DisputeFilter; query: string },
): Promise<ListResult<DisputeRow>> {
  const pattern = containsPattern(input.query);
  const rows = await db
    .select({
      disputeId: disputes.id,
      receivedAt: disputes.receivedAt,
      channel: disputes.channel,
      type: disputes.type,
      status: disputes.status,
      outcome: disputes.outcome,
      handledAt: disputes.handledAt,
      reservationId: reservations.id,
      reservationCode: reservations.code,
      shopName: shops.name,
      customerId: customers.id,
      customerName: customers.name,
    })
    .from(disputes)
    .innerJoin(reservations, eq(reservations.id, disputes.reservationId))
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .innerJoin(shops, eq(shops.id, slots.shopId))
    .innerJoin(customers, eq(customers.id, reservations.customerId))
    .where(
      and(
        input.filter === 'all' ? undefined : eq(disputes.status, input.filter),
        input.query
          ? or(
              ilike(reservations.code, pattern),
              ilike(shops.name, pattern),
              ilike(customers.name, pattern),
              ilike(customers.nickname, pattern),
            )
          : undefined,
      ),
    )
    .orderBy(...ORDER[input.filter])
    .limit(ADMIN_LIST_LIMIT + 1);
  // DB의 check 제약이 정해 둔 값만 허용한다
  return toListResult(
    rows.map((row) => ({
      ...row,
      channel: row.channel as DisputeChannel,
      type: row.type as DisputeType,
      status: row.status as DisputeStatus,
      outcome: row.outcome as DisputeOutcome | null,
    })),
  );
}

/** 상세 */
export type DisputeDetail = DisputeRow & {
  content: string;
  result: string | null;
  createdAt: Date;
  reservationStatus: ReservationStatus;
  visitResult: VisitResult | null;
  visitRecordedAt: Date | null;
  cancelledAt: Date | null;
  startAt: Date;
  menuName: string;
  shopId: string;
};

/** 이의제기 상세와 그 예약. 없으면 null */
export async function selectDisputeDetail(
  db: DbReader,
  disputeId: string,
): Promise<DisputeDetail | null> {
  const [row] = await db
    .select({
      disputeId: disputes.id,
      receivedAt: disputes.receivedAt,
      channel: disputes.channel,
      type: disputes.type,
      status: disputes.status,
      outcome: disputes.outcome,
      handledAt: disputes.handledAt,
      content: disputes.content,
      result: disputes.result,
      createdAt: disputes.createdAt,
      reservationId: reservations.id,
      reservationCode: reservations.code,
      reservationStatus: reservations.status,
      visitResult: reservations.visitResult,
      visitRecordedAt: reservations.visitRecordedAt,
      cancelledAt: reservations.cancelledAt,
      startAt: slots.startAt,
      menuName: slots.menuName,
      shopId: shops.id,
      shopName: shops.name,
      customerId: customers.id,
      customerName: customers.name,
    })
    .from(disputes)
    .innerJoin(reservations, eq(reservations.id, disputes.reservationId))
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .innerJoin(shops, eq(shops.id, slots.shopId))
    .innerJoin(customers, eq(customers.id, reservations.customerId))
    .where(eq(disputes.id, disputeId));
  if (!row) return null;
  // DB의 check 제약이 정해 둔 값만 허용한다
  return {
    ...row,
    channel: row.channel as DisputeChannel,
    type: row.type as DisputeType,
    status: row.status as DisputeStatus,
    outcome: row.outcome as DisputeOutcome | null,
    reservationStatus: row.reservationStatus as ReservationStatus,
    visitResult: row.visitResult as VisitResult | null,
  };
}
