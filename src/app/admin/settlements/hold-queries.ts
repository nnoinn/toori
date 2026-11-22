// 운영자 정산 보류(#373 ②) 화면 읽기. 정산 목록·샵 정산·예약 상세가 같이 쓴다. 서버에서만 부른다.
// 보류 사유와 건·푼 운영자 이름(admin_profiles)을 같이 읽는다. 사유는 운영자 화면에만 보이고 원장님에게는 숨긴다(11/15 nnoinn)

import 'server-only';

import { and, desc, eq, isNull, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { getDb } from '@/db';
import { adminProfiles, reservations, settlementHolds, shops, slots } from '@/db/schema';
import { type SettlementHoldCode, toAdminNoticeCode } from '@/server/policy/admin-notice';

type Db = Pick<ReturnType<typeof getDb>, 'select'>;

export type SettlementHoldRow = {
  holdId: string;
  /** 거래 하나 보류면 그 예약, 샵 전체 보류면 null */
  reservationId: string | null;
  reservationCode: string | null;
  shopId: string;
  shopName: string;
  reason: string;
  /** 원장님에게 보여 줄 사유 코드(#489) */
  reasonCode: SettlementHoldCode;
  heldAt: Date;
  heldByName: string | null;
  releasedAt: Date | null;
  releasedByName: string | null;
  releaseMemo: string | null;
};

const heldBy = alias(adminProfiles, 'held_by_profile');
const releasedBy = alias(adminProfiles, 'released_by_profile');

/** 보류 줄을 읽는다. 거래 보류는 그 예약의 샵, 샵 보류는 그 샵. 풀리지 않은 것 먼저, 그다음 건 시각이 늦은 것부터 */
async function selectHolds(db: Db, where: SQL | undefined, limit?: number) {
  const query = db
    .select({
      holdId: settlementHolds.id,
      reservationId: settlementHolds.reservationId,
      reservationCode: reservations.code,
      shopId: shops.id,
      shopName: shops.name,
      reason: settlementHolds.reason,
      reasonCode: settlementHolds.reasonCode,
      heldAt: settlementHolds.heldAt,
      heldByName: heldBy.name,
      releasedAt: settlementHolds.releasedAt,
      releasedByName: releasedBy.name,
      releaseMemo: settlementHolds.releaseMemo,
    })
    .from(settlementHolds)
    .leftJoin(reservations, eq(reservations.id, settlementHolds.reservationId))
    .leftJoin(slots, eq(slots.id, reservations.slotId))
    .innerJoin(shops, eq(shops.id, sql`coalesce(${settlementHolds.shopId}, ${slots.shopId})`))
    .leftJoin(heldBy, eq(heldBy.userId, settlementHolds.heldBy))
    .leftJoin(releasedBy, eq(releasedBy.userId, settlementHolds.releasedBy))
    .where(where)
    .orderBy(sql`${settlementHolds.releasedAt} is not null`, desc(settlementHolds.heldAt));
  const rows = limit === undefined ? await query : await query.limit(limit);
  return rows.map((row): SettlementHoldRow => ({
    ...row,
    reasonCode: toAdminNoticeCode('settlement_hold', row.reasonCode),
  }));
}

/** 지금 풀리지 않은 보류 전부(거래·샵). 정산 목록에 보여 준다 */
export function selectActiveHolds(db: Db, limit: number): Promise<SettlementHoldRow[]> {
  return selectHolds(db, isNull(settlementHolds.releasedAt), limit);
}

/** 그 예약의 보류 기록(지금 것과 지난 것) */
export function selectReservationHolds(
  db: Db,
  reservationId: string,
): Promise<SettlementHoldRow[]> {
  return selectHolds(db, eq(settlementHolds.reservationId, reservationId));
}

/** 그 샵 전체 보류 기록(지금 것과 지난 것) */
export function selectShopHolds(db: Db, shopId: string): Promise<SettlementHoldRow[]> {
  return selectHolds(db, eq(settlementHolds.shopId, shopId));
}

/** 그 샵 거래 중 지금 보류 중인 것(샵 정산 화면) */
export function selectShopReservationHolds(db: Db, shopId: string): Promise<SettlementHoldRow[]> {
  return selectHolds(
    db,
    and(
      eq(slots.shopId, shopId),
      isNull(settlementHolds.shopId),
      isNull(settlementHolds.releasedAt),
    ),
  );
}

/** 그 샵 전체 보류가 지금 걸려 있는지(예약 상세에서 안내) */
export async function isShopHeld(db: Db, shopId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: settlementHolds.id })
    .from(settlementHolds)
    .where(and(eq(settlementHolds.shopId, shopId), isNull(settlementHolds.releasedAt)))
    .limit(1);
  return row !== undefined;
}
