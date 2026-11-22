// 운영자 샵 상세의 '취소 기록' 칸(X-207·X-208 핵심 규칙: 샵별 원장님 귀책 취소 횟수·시작 몇 시간 전, 합의 후 취소 횟수·사유). 서버에서만 부른다.
// 기록은 이미 쌓인다: 원장님 귀책 취소는 예약(cancel_actor owner_fault, hours_before_start_at_cancel)과 패널티(owner_penalties),
// 합의 후 취소는 요청 표(agreed_cancel_requests, 사유·결과). 여기서는 샵마다 세고 최근 것을 읽기만 한다.
// 기간(#486)을 고르면 원장님 사정 취소는 취소한 시각, 합의 후 취소는 요청한 시각이 그 안인 것만 센다(최근 10건도 그 안에서)

import 'server-only';

import { and, type AnyColumn, count, desc, eq, gte, lt, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import { agreedCancelRequests, ownerPenalties, reservations, slots } from '@/db/schema';
import type { AgreedCancelRequestStatus } from '@/db/schema/refunds';
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
  status: AgreedCancelRequestStatus;
};

export type ShopCancelStats = {
  ownerFault: { count: number; recent: OwnerFaultCancelRow[] };
  agreed: {
    /** 결과별 요청 수(동의 = 합의 후 취소된 수) */
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

/** 샵의 원장님 귀책 취소와 합의 후 취소 요청 기록. 기간을 주지 않으면 전체 기간 */
export async function selectShopCancelStats(
  db: DbReader,
  shopId: string,
  range: CancelStatsRange = ALL_TIME,
): Promise<ShopCancelStats> {
  const [ownerFaultCount, ownerFaultRecent, agreedCounts, agreedRecent] = await Promise.all([
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
      .where(agreedOfShop(shopId, range))
      .groupBy(agreedCancelRequests.status, agreedCancelRequests.reason),
    db
      .select({
        requestId: agreedCancelRequests.id,
        reservationId: reservations.id,
        reservationCode: reservations.code,
        requestedAt: agreedCancelRequests.requestedAt,
        reason: agreedCancelRequests.reason,
        reasonText: agreedCancelRequests.reasonText,
        status: agreedCancelRequests.status,
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
        ...row,
        reason: row.reason as AgreedCancelReason,
        status: row.status as AgreedCancelRequestStatus,
      })),
    },
  };
}
