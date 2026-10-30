// 원장님 대시보드 조회 (DB, O9, S-401, #21 Q12). 이 화면에서만 쓰는 서버 코드라 화면 폴더에 둔다.
// 모든 조회는 shopId로 그 샵 매물만 본다. 예약자 정보(이름·연락처)는 여기서 읽지 않는다(예약 상세 O11).

import 'server-only';

import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm';

import { getDb } from '@/db';
import { reservations, slots } from '@/db/schema';
import type { SlotStatus } from '@/db/schema/slots';

import type { DashboardSlot } from './dashboard';

type Db = Pick<ReturnType<typeof getDb>, 'select'>;

const slotColumns = {
  id: slots.id,
  status: slots.status,
  startAt: slots.startAt,
  endAt: slots.endAt,
  publishAt: slots.publishAt,
  menuName: slots.menuName,
  listPrice: slots.listPrice,
  salePrice: slots.salePrice,
  discountRate: slots.discountRate,
  newCustomerOnly: slots.newCustomerOnly,
  holdCustomerId: slots.holdCustomerId,
  holdExpiresAt: slots.holdExpiresAt,
  reservationCode: reservations.code,
};

type SlotRow = {
  [K in keyof typeof slotColumns]: K extends 'reservationCode'
    ? string | null
    : (typeof slots.$inferSelect)[Exclude<K, 'reservationCode'>];
};

function toDashboardSlot(row: SlotRow): DashboardSlot {
  return {
    ...row,
    // status는 DB 제약(slots_status_check)으로 여섯 값만 들어간다
    status: row.status as SlotStatus,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    publishAt: row.publishAt.toISOString(),
    holdExpiresAt: row.holdExpiresAt?.toISOString() ?? null,
  };
}

/** from(오늘 0시) 이후에 시작하는 그 샵 매물(오늘·예정 탭). 시작 시각 순서 */
export async function selectDashboardSlots(
  db: Db,
  shopId: string,
  from: Date,
): Promise<DashboardSlot[]> {
  const rows = await db
    .select(slotColumns)
    .from(slots)
    .leftJoin(reservations, eq(reservations.slotId, slots.id))
    .where(and(eq(slots.shopId, shopId), gte(slots.startAt, from)))
    .orderBy(asc(slots.startAt));
  return rows.map(toDashboardSlot);
}

/**
 * "처리 필요"(#21 Q12): 시작 시각이 지났는데 방문·노쇼를 기록하지 않은 예정 예약. 날짜와 상관없이 오래된 것부터.
 * 자동으로 처리하지 않고 원장님이 처리할 때까지 계속 보여준다(정산 기준일까지 안 되면 운영자가 확인)
 */
export async function selectNeedsVisitRecord(
  db: Db,
  shopId: string,
  now: Date,
): Promise<DashboardSlot[]> {
  const rows = await db
    .select(slotColumns)
    .from(slots)
    .innerJoin(reservations, eq(reservations.slotId, slots.id))
    .where(
      and(
        eq(slots.shopId, shopId),
        lte(slots.startAt, now),
        eq(reservations.status, 'confirmed'),
        isNull(reservations.visitResult),
      ),
    )
    .orderBy(asc(slots.startAt));
  return rows.map(toDashboardSlot);
}
