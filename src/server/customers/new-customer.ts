// 신규 고객 판별 (X-104, C-306, 연결 #7, Issue #49). 서버에서만 부른다.
// 고객 id를 그대로 받으므로 'use server'로 만들지 않는다(화면에서 남의 이력을 물어볼 수 없게). 쿼리·서버 함수 파일에서 부른다.
//
// 이력 있음: 그 샵 예약 중 확정 또는 이용 완료(노쇼 포함)가 하나라도 있음. 취소된 예약은 위약금을 냈어도 뺀다(#13 Q12).
// 고객 계정 기준이라 같은 사람의 원장님 계정과는 상관없다.

import 'server-only';

import { and, eq, exists, inArray, not, or, type SQL, sql } from 'drizzle-orm';
import { alias, QueryBuilder } from 'drizzle-orm/pg-core';

import { getDb } from '@/db';
import { reservations, slots } from '@/db/schema';
import type { ReservationStatus } from '@/db/schema/payments';

type Db = Pick<ReturnType<typeof getDb>, 'selectDistinct'>;

/** 이력으로 보는 예약 상태 */
export const VISITED_RESERVATION_STATUSES = [
  'confirmed',
  'completed',
] as const satisfies readonly ReservationStatus[];

// 바깥 쿼리의 slots와 섞이지 않게 이력 조회에는 별칭을 쓴다
const visitedReservation = alias(reservations, 'visited_reservation');
const visitedSlot = alias(slots, 'visited_slot');
const joinVisitedSlot = eq(visitedSlot.id, visitedReservation.slotId);

function isVisitedBy(customerId: string): SQL {
  return and(
    eq(visitedReservation.customerId, customerId),
    inArray(visitedReservation.status, [...VISITED_RESERVATION_STATUSES]),
  )!;
}

// DB 연결 없이 조건 안의 하위 쿼리만 만든다. 실행할 때 바깥 쿼리와 같은 이름 규칙(snake_case)으로 바뀐다
const queryBuilder = new QueryBuilder({ casing: 'snake_case' });

/**
 * 목록·지도 조회의 where에 넣는 조건: 신규 고객 전용이 아니거나, 이 고객이 그 샵 이력이 없는 매물만.
 * 바깥 쿼리의 slots(별칭 없이)를 참조한다. 매물 상태 조건(slotStatusIs, 연결 #16)·customerVisibleShop()과 나란히 넣는다.
 * customerId가 null(로그인 안 함, 원장님 모드로 둘러보기, 고객 계정 없음)이면 아무것도 거르지 않는다(#49 3장)
 */
export function newCustomerOnlyVisible(customerId: string | null): SQL {
  if (customerId === null) return sql`true`;
  const visitedThisShop = queryBuilder
    .select({ one: sql`1` })
    .from(visitedReservation)
    .innerJoin(visitedSlot, joinVisitedSlot)
    .where(and(isVisitedBy(customerId), eq(visitedSlot.shopId, slots.shopId)));
  return or(eq(slots.newCustomerOnly, false), not(exists(visitedThisShop)))!;
}

/** 여러 샵 중 이 고객이 이력이 있는 샵 id(지도 마커 묶음). 트랜잭션 안에서 확인하려면 tx를 넘긴다 */
export async function getVisitedShopIds(
  customerId: string,
  shopIds: readonly string[],
  db: Db = getDb(),
): Promise<Set<string>> {
  const ids = [...new Set(shopIds)];
  if (ids.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ shopId: visitedSlot.shopId })
    .from(visitedReservation)
    .innerJoin(visitedSlot, joinVisitedSlot)
    .where(and(isVisitedBy(customerId), inArray(visitedSlot.shopId, ids)));
  return new Set(rows.map((row) => row.shopId));
}

/** 이 샵에 이력이 없으면 true(상세 화면, 결제 직전 재검증 W11). 트랜잭션 안에서 확인하려면 tx를 넘긴다 */
export async function isNewCustomer(
  customerId: string,
  shopId: string,
  db: Db = getDb(),
): Promise<boolean> {
  return !(await getVisitedShopIds(customerId, [shopId], db)).has(shopId);
}
