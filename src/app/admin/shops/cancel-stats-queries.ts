// 운영자 샵 상세의 '취소 기록' 칸(X-207·X-208 핵심 규칙: 샵별 원장님 귀책 취소 횟수·시작 몇 시간 전, 합의 후 취소 횟수·사유). 서버에서만 부른다.
// 기록은 이미 쌓인다: 원장님 귀책 취소는 예약(cancel_actor owner_fault, hours_before_start_at_cancel)과 패널티(owner_penalties),
// 합의 후 취소는 요청 표(agreed_cancel_requests, 사유·결과). 여기서는 샵마다 세고 최근 것을 읽기만 한다.
// 기간(#486)을 고르면 원장님 사정 취소는 취소한 시각, 합의 후 취소는 요청한 시각이 그 안인 것만 센다(최근 10건도 그 안에서).
// 합의 후 취소 요청의 상태는 저장된 값이 아니라 지금 상태(currentRequestStatus: 답 기한이 지났으면 만료, 그사이 예약이 바뀌었으면 끝남)다.
// 원장님·손님 화면과 예약 상세가 쓰는 같은 규칙이라, 정리 작업이 상태를 바꾸기 전이라도 같은 상태로 보이고 같은 기준으로 센다

import 'server-only';

import { and, type AnyColumn, count, desc, eq, gte, lt, ne, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import { agreedCancelRequests, ownerPenalties, reservations, slots } from '@/db/schema';
import type { ReservationStatus, VisitResult } from '@/db/schema/payments';
import type { AgreedCancelRequestStatus } from '@/db/schema/refunds';
import { currentRequestStatus } from '@/server/refunds/agreed-cancel-rules';
import type { AgreedCancelReason } from '@/server/refunds/agreed-cancel-types';

import type { CancelStatsRange } from './cancel-stats-period';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

/** 최근 몇 건까지 줄로 보여 주는지 */
export const SHOP_CANCEL_RECENT_LIMIT = 10;

export type OwnerFaultCancelRow = {
  reservationId: string;
  reservationCode: string;
  menuName: string;
  startAt: Date;
  cancelledAt: Date | null;
  /** 서비스 시작 몇 시간 전에 취소했는지(시간 단위, 버림) */
  hoursBeforeStart: number | null;
  /** 패널티와 아직 떼지 못한 금액. 패널티가 없으면(옛 기록) null */
  penalty: { amount: number; remaining: number } | null;
};

export type AgreedCancelRequestRow = {
  requestId: string;
  reservationId: string;
  reservationCode: string;
  requestedAt: Date;
  reason: AgreedCancelReason;
  /** 기타 사유의 내용 */
  reasonText: string | null;
  /** 지금 상태(답 기한이 지났으면 만료, 손님이 답하기 전에 예약이 바뀌었으면 끝남) */
  status: AgreedCancelRequestStatus;
};

export type ShopCancelStats = {
  ownerFault: { count: number; recent: OwnerFaultCancelRow[] };
  agreed: {
    /** 지금 상태별 요청 수(동의 = 합의 후 취소된 수) */
    byStatus: Record<AgreedCancelRequestStatus, number>;
    /** 동의로 끝난 요청의 사유별 수 */
    agreedByReason: Record<AgreedCancelReason, number>;
    recent: AgreedCancelRequestRow[];
  };
};

/** 전체 기간 */
const ALL_TIME: CancelStatsRange = { from: null, before: null };

/** 그 시각이 고른 기간 안(from 이후 포함, before 전) */
const within = (column: AnyColumn, range: CancelStatsRange) =>
  and(
    range.from ? gte(column, range.from) : undefined,
    range.before ? lt(column, range.before) : undefined,
  );

const ownerFaultOfShop = (shopId: string, range: CancelStatsRange) =>
  and(
    eq(slots.shopId, shopId),
    eq(reservations.cancelActor, 'owner_fault'),
    within(reservations.cancelledAt, range),
  );

const agreedOfShop = (shopId: string, range: CancelStatsRange) =>
  and(eq(slots.shopId, shopId), within(agreedCancelRequests.requestedAt, range));

/** 요청의 지금 상태. DB의 check 제약이 정해 둔 상태·예약 상태·방문 결과만 허용한다 */
function nowStatus(
  row: { status: string; expiresAt: Date; reservationStatus: string; visitResult: string | null },
  now: Date,
): AgreedCancelRequestStatus {
  return currentRequestStatus(
    { status: row.status as AgreedCancelRequestStatus, expiresAt: row.expiresAt },
    {
      status: row.reservationStatus as ReservationStatus,
      visitResult: row.visitResult as VisitResult | null,
    },
    now,
  );
}

/** 지금 상태를 정하는 데 필요한 칸 */
const nowStatusColumns = {
  status: agreedCancelRequests.status,
  expiresAt: agreedCancelRequests.expiresAt,
  reservationStatus: reservations.status,
  visitResult: reservations.visitResult,
};

/**
 * 샵의 원장님 귀책 취소와 합의 후 취소 요청 기록. 기간을 주지 않으면 전체 기간.
 * now는 합의 후 취소 요청의 지금 상태(만료)를 정하는 시각
 */
export async function selectShopCancelStats(
  db: DbReader,
  shopId: string,
  now: Date,
  range: CancelStatsRange = ALL_TIME,
): Promise<ShopCancelStats> {
  const [ownerFaultCount, ownerFaultRecent, agreedCounts, agreedWaiting, agreedRecent] =
    await Promise.all([
      db
        .select({ count: count() })
        .from(reservations)
        .innerJoin(slots, eq(slots.id, reservations.slotId))
        .where(ownerFaultOfShop(shopId, range)),
      db
        .select({
          reservationId: reservations.id,
          reservationCode: reservations.code,
          menuName: slots.menuName,
          startAt: slots.startAt,
          cancelledAt: reservations.cancelledAt,
          hoursBeforeStart: reservations.hoursBeforeStartAtCancel,
          penaltyAmount: ownerPenalties.amount,
          penaltyCollected: ownerPenalties.collectedAmount,
        })
        .from(reservations)
        .innerJoin(slots, eq(slots.id, reservations.slotId))
        .leftJoin(ownerPenalties, eq(ownerPenalties.reservationId, reservations.id))
        .where(ownerFaultOfShop(shopId, range))
        .orderBy(desc(reservations.cancelledAt))
        .limit(SHOP_CANCEL_RECENT_LIMIT),
      db
        .select({
          status: agreedCancelRequests.status,
          reason: agreedCancelRequests.reason,
          count: sql<number>`count(*)::int`,
        })
        .from(agreedCancelRequests)
        .innerJoin(reservations, eq(reservations.id, agreedCancelRequests.reservationId))
        .innerJoin(slots, eq(slots.id, reservations.slotId))
        .where(and(agreedOfShop(shopId, range), ne(agreedCancelRequests.status, 'requested')))
        .groupBy(agreedCancelRequests.status, agreedCancelRequests.reason),
      // 저장된 상태가 '답 기다림'인 요청은 지금 상태(답 기다림·만료·끝남)로 하나씩 센다. 예약마다 한 번에 하나뿐이라 많지 않다
      db
        .select(nowStatusColumns)
        .from(agreedCancelRequests)
        .innerJoin(reservations, eq(reservations.id, agreedCancelRequests.reservationId))
        .innerJoin(slots, eq(slots.id, reservations.slotId))
        .where(and(agreedOfShop(shopId, range), eq(agreedCancelRequests.status, 'requested'))),
      db
        .select({
          requestId: agreedCancelRequests.id,
          reservationId: reservations.id,
          reservationCode: reservations.code,
          requestedAt: agreedCancelRequests.requestedAt,
          reason: agreedCancelRequests.reason,
          reasonText: agreedCancelRequests.reasonText,
          ...nowStatusColumns,
        })
        .from(agreedCancelRequests)
        .innerJoin(reservations, eq(reservations.id, agreedCancelRequests.reservationId))
        .innerJoin(slots, eq(slots.id, reservations.slotId))
        .where(agreedOfShop(shopId, range))
        .orderBy(desc(agreedCancelRequests.requestedAt))
        .limit(SHOP_CANCEL_RECENT_LIMIT),
    ]);

  const byStatus: Record<AgreedCancelRequestStatus, number> = {
    requested: 0,
    agreed: 0,
    declined: 0,
    expired: 0,
    closed: 0,
  };
  const agreedByReason: Record<AgreedCancelReason, number> = {
    style_mismatch: 0,
    customer_declined: 0,
    other: 0,
  };
  // DB의 check 제약이 정해 둔 값만 허용한다
  for (const row of agreedCounts) {
    const status = row.status as AgreedCancelRequestStatus;
    byStatus[status] += row.count;
    if (status === 'agreed') agreedByReason[row.reason as AgreedCancelReason] += row.count;
  }
  for (const row of agreedWaiting) byStatus[nowStatus(row, now)] += 1;

  return {
    ownerFault: {
      count: ownerFaultCount[0]?.count ?? 0,
      recent: ownerFaultRecent.map((row) => ({
        reservationId: row.reservationId,
        reservationCode: row.reservationCode,
        menuName: row.menuName,
        startAt: row.startAt,
        cancelledAt: row.cancelledAt,
        hoursBeforeStart: row.hoursBeforeStart,
        penalty:
          row.penaltyAmount === null || row.penaltyCollected === null
            ? null
            : {
                amount: row.penaltyAmount,
                remaining: row.penaltyAmount - row.penaltyCollected,
              },
      })),
    },
    agreed: {
      byStatus,
      agreedByReason,
      recent: agreedRecent.map((row) => ({
        requestId: row.requestId,
        reservationId: row.reservationId,
        reservationCode: row.reservationCode,
        requestedAt: row.requestedAt,
        reason: row.reason as AgreedCancelReason,
        reasonText: row.reasonText,
        status: nowStatus(row, now),
      })),
    },
  };
}
