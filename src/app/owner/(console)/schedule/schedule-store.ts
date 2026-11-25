// 원장님 예약 현황 캘린더 조회 (DB, S-402). 이 화면에서만 쓰는 서버 코드라 화면 폴더에 둔다.
// 모든 조회는 shopId로 그 샵 것만 본다. 매물은 대시보드와 같은 조건(ownerListedSlot, WINDOW-08)이라
// 손님이 결제 중인 시간대 칸과 결제 없이 비운 칸은 빠진다. 예약자는 이름만 읽는다(연락처는 예약 상세 O11).
// 시간대 매물은 대시보드 읽기(selectDashboardWindows)를 같이 쓴다.

import 'server-only';

import { and, asc, eq, gte, lt, ne } from 'drizzle-orm';

import { getDb } from '@/db';
import { customers, reservations, shops, slots } from '@/db/schema';
import type { BusinessHours } from '@/db/schema/shops';
import type { SlotStatus } from '@/db/schema/slots';
import type { ReservationStatus, VisitResult } from '@/db/schema';
import { canEditSlot, getSlotStatus, isSlotOnHold } from '@/features/slot-status/slot-status';
import { ownerListedSlot } from '@/server/slots/visibility';

import { WINDOW_VIEW_STATUS } from '../dashboard/dashboard';
import { selectDashboardWindows } from '../dashboard/dashboard-store';
import { bookerName, reservationView } from '../reservations/reservation-detail';
import type { ScheduleSlot, ScheduleWindow } from './schedule';

type Db = Pick<ReturnType<typeof getDb>, 'select'>;

/** 그 샵의 영업시간(세로 범위를 정할 때). 샵이 없으면 빈 목록 */
export async function selectScheduleHours(db: Db, shopId: string): Promise<BusinessHours> {
  const [shop] = await db
    .select({ businessHours: shops.businessHours })
    .from(shops)
    .where(eq(shops.id, shopId));
  return shop?.businessHours ?? [];
}

/**
 * [from, to)에 시작하는 그 샵 매물(시작 시각 순서)과 예약. 상태·고칠 수 있는지·예약 상태는 지금(now) 기준으로 계산한다
 */
export async function selectScheduleSlots(
  db: Db,
  shopId: string,
  { from, to, now }: { from: Date; to: Date; now: Date },
): Promise<ScheduleSlot[]> {
  const rows = await db
    .select({
      id: slots.id,
      status: slots.status,
      startAt: slots.startAt,
      endAt: slots.endAt,
      publishAt: slots.publishAt,
      menuName: slots.menuName,
      listPrice: slots.listPrice,
      salePrice: slots.salePrice,
      discountRate: slots.discountRate,
      holdCustomerId: slots.holdCustomerId,
      holdExpiresAt: slots.holdExpiresAt,
      reservationId: reservations.id,
      reservationCode: reservations.code,
      reservationStatus: reservations.status,
      visitResult: reservations.visitResult,
      customerName: customers.name,
    })
    .from(slots)
    .leftJoin(reservations, eq(reservations.slotId, slots.id))
    .leftJoin(customers, eq(customers.id, reservations.customerId))
    .where(
      and(
        eq(slots.shopId, shopId),
        gte(slots.startAt, from),
        lt(slots.startAt, to),
        ownerListedSlot(),
        // 임시: E2E(#605)가 잡는지 일부러 예약 현황에서 게시예정 매물을 뺀다. 되돌린다
        ne(slots.status, 'scheduled'),
      ),
    )
    .orderBy(asc(slots.startAt));

  return rows.map((row) => {
    // status는 DB 제약(slots_status_check)으로 여섯 값만 들어간다
    const slot = { ...row, status: row.status as SlotStatus };
    return {
      kind: 'slot',
      id: row.id,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      status: getSlotStatus(slot, now),
      menuName: row.menuName,
      listPrice: row.listPrice,
      salePrice: row.salePrice,
      discountRate: row.discountRate,
      onHold: isSlotOnHold(slot, now),
      editable: canEditSlot(slot, now),
      reservation:
        row.reservationId && row.reservationCode && row.reservationStatus
          ? {
              id: row.reservationId,
              code: row.reservationCode,
              customerName: row.customerName === null ? null : bookerName(row.customerName),
              view: reservationView(
                {
                  // 두 값은 DB 제약(reservations_*_check)으로 정해진 값만 들어간다
                  status: row.reservationStatus as ReservationStatus,
                  visitResult: row.visitResult as VisitResult | null,
                  startAt: row.startAt,
                },
                now,
              ),
            }
          : null,
    } satisfies ScheduleSlot;
  });
}

/** [from, to)에 시작하는 그 샵 시간대 매물(#308). 상태는 대시보드와 같이 지금 기준으로 계산해 매물 상태 이름으로 바꾼다 */
export async function selectScheduleWindows(
  db: Db,
  shopId: string,
  { from, to, now }: { from: Date; to: Date; now: Date },
): Promise<ScheduleWindow[]> {
  const windows = await selectDashboardWindows(db, shopId, from, now, { before: to });
  return windows.map((window) => ({
    kind: 'window',
    id: window.id,
    startAt: window.startAt,
    endAt: window.endAt,
    status: WINDOW_VIEW_STATUS[window.state],
    menuCount: window.menus.length,
  }));
}
