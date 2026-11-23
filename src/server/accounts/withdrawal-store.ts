// 회원 탈퇴 막는 이유를 세는 DB 읽기 (#154 본문 1장). 서버에서만 부른다. 읽기만 한다.
// 지금 있는 표(예약·매물·시간대·이의제기·쿠폰·정산·패널티)로 센다. 탈퇴 기록 표는 DB 구조 승인 뒤(0023) 더한다

import 'server-only';

import { and, count, eq, gt, inArray, isNotNull, isNull, lte, or, type SQL } from 'drizzle-orm';

import type { getDb } from '@/db';
import { coupons, disputes, reservations, slots, slotWindows } from '@/db/schema';
import { slotIsOnHold, slotStatusIs } from '@/features/slot-status/slot-status-sql';
import { PAYMENT_FEE_RATE } from '@/server/policy/fees';
import {
  readOutstandingPenalty,
  readShopSettlementRows,
} from '@/server/settlements/settlement-store';
import { buildSettlementList, toSettlementItemView } from '@/server/settlements/settlement-view';

import type { CustomerWithdrawalFacts, OwnerWithdrawalFacts } from './withdrawal-rules';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

/** 판매 전(게시예정·게시중) 매물 */
const openSlot = (now: Date) => or(slotStatusIs('scheduled', now), slotStatusIs('published', now));

async function countOf(query: Promise<{ value: number }[]>): Promise<number> {
  const [row] = await query;
  return row?.value ?? 0;
}

/** 예정 예약을 시작 전(이용 예정)과 시작 뒤(방문 확인 중)로 센다. whose는 고객 계정·원장님 샵 조건 */
async function countConfirmed(db: DbReader, whose: SQL, now: Date) {
  const confirmed = and(
    whose,
    eq(reservations.status, 'confirmed'),
    isNull(reservations.visitResult),
  );
  const base = () =>
    db
      .select({ value: count() })
      .from(reservations)
      .innerJoin(slots, eq(slots.id, reservations.slotId));
  const [upcoming, visitPending] = await Promise.all([
    countOf(base().where(and(confirmed, gt(slots.startAt, now)))),
    countOf(base().where(and(confirmed, lte(slots.startAt, now)))),
  ]);
  return { upcoming, visitPending };
}

/** 확인 중인 이의제기 수. whose는 고객 계정·원장님 샵 조건 */
function countOpenDisputes(db: DbReader, whose: SQL) {
  return countOf(
    db
      .select({ value: count() })
      .from(disputes)
      .innerJoin(reservations, eq(reservations.id, disputes.reservationId))
      .innerJoin(slots, eq(slots.id, reservations.slotId))
      .where(and(whose, eq(disputes.status, 'open'))),
  );
}

/** 고객 계정에서 센 값 */
export async function readCustomerWithdrawalFacts(
  db: DbReader,
  customerId: string,
  now: Date,
): Promise<CustomerWithdrawalFacts> {
  const whose = eq(reservations.customerId, customerId);
  const [confirmed, openDisputes, unusedCoupons, holding] = await Promise.all([
    countConfirmed(db, whose, now),
    countOpenDisputes(db, whose),
    countOf(
      db
        .select({ value: count() })
        .from(coupons)
        .where(and(eq(coupons.customerId, customerId), isNull(coupons.usedOrderId))),
    ),
    countOf(
      db
        .select({ value: count() })
        .from(slots)
        .where(
          and(
            eq(slots.holdCustomerId, customerId),
            inArray(slots.status, ['scheduled', 'published']),
            slotIsOnHold(now),
          ),
        ),
    ),
  ]);
  return {
    upcomingReservations: confirmed.upcoming,
    visitPendingReservations: confirmed.visitPending,
    openDisputes,
    unusedCoupons,
    holding: holding > 0,
  };
}

/** 원장님 샵에서 센 값 */
export async function readOwnerWithdrawalFacts(
  db: DbReader,
  shopId: string,
  now: Date,
): Promise<OwnerWithdrawalFacts> {
  const whose = eq(slots.shopId, shopId);
  const [confirmed, openDisputes, heldByCustomer, openSlots, openWindows, unpaidRows, penalty] =
    await Promise.all([
      countConfirmed(db, whose, now),
      countOpenDisputes(db, whose),
      countOf(
        db
          .select({ value: count() })
          .from(slots)
          .where(and(eq(slots.shopId, shopId), openSlot(now), isNotNull(slots.holdCustomerId))),
      ),
      // 시간대 안 칸은 그 시간대를 마감하면 같이 닫혀서 한 시술 매물만 센다
      countOf(
        db
          .select({ value: count() })
          .from(slots)
          .where(and(eq(slots.shopId, shopId), isNull(slots.windowId), openSlot(now))),
      ),
      countOf(
        db
          .select({ value: count() })
          .from(slotWindows)
          .where(
            and(
              eq(slotWindows.shopId, shopId),
              inArray(slotWindows.status, ['scheduled', 'published']),
              gt(slotWindows.endAt, now),
            ),
          ),
      ),
      readShopSettlementRows(db, { shopId, unpaidOnly: true }),
      readOutstandingPenalty(db, shopId),
    ]);

  // 원장님 정산 내역(S-502)과 같은 기준: 정산할 금액이 없는 줄(원장님 사정 취소·무효)은 빼고, 지급하지 않은 줄이 있으면 막는다
  const options = { now, paymentFeeRate: PAYMENT_FEE_RATE };
  const unpaid = unpaidRows
    .map((row) => toSettlementItemView(row, options))
    .filter((item) => item !== null && item.status !== 'paid');
  const nextPayout = buildSettlementList({
    rows: [],
    unpaidRows,
    outstandingPenalty: penalty,
    ...options,
  }).nextPayout;

  return {
    upcomingReservations: confirmed.upcoming,
    heldByCustomer,
    visitPendingReservations: confirmed.visitPending,
    openDisputes,
    unpaidSettlement: unpaid.length > 0 ? { nextPayoutDate: nextPayout?.date ?? null } : null,
    outstandingPenalty: penalty,
    openSlotCount: openSlots + openWindows,
  };
}
