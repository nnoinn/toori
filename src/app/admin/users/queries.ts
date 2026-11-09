// 회원 조회 (A-102, W18). 운영자 화면에서만 쓰는 서버 코드라 화면 폴더에 둔다.
// 화면(page)이 ensureAdminPage()로 관리자를 확인한 뒤 부른다. db를 받아서 테스트(withRollback)에서 tx를 넘길 수 있다.
// 조회만 한다. 정산 계좌는 읽지 않는다.

import 'server-only';

import { count, desc, eq, ilike, or, type SQL, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import {
  customers,
  orders,
  owners,
  profiles,
  type ReservationStatus,
  reservations,
  shops,
  type ShopStatus,
  slots,
  type VisitResult,
} from '@/db/schema';
import { normalizePhone } from '@/lib/phone';
import { type OptionalConsents, readOptionalConsents } from '@/server/auth/account-store';

import { ADMIN_LIST_LIMIT, containsPattern, type ListResult, toListResult } from '../lookup';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

/** 고객 상세에서 보여줄 최근 예약 수 */
const RECENT_RESERVATIONS = 20;

/** 예약 수·취소 수·노쇼 수. 제재 기능(X-402)이 아직 없어서 제재 이력 대신 보여준다 */
const reservationCounts = {
  reservationCount: count(reservations.id),
  cancelCount: sql<number>`count(*) filter (where ${reservations.status} = 'cancelled')`.mapWith(
    Number,
  ),
  noShowCount: sql<number>`count(*) filter (where ${reservations.visitResult} = 'no_show')`.mapWith(
    Number,
  ),
};

export type CustomerRow = {
  customerId: string;
  nickname: string;
  phone: string | null;
  createdAt: Date;
  withdrawnAt: Date | null;
  reservationCount: number;
  cancelCount: number;
  noShowCount: number;
};

/** 고객 목록(최근 가입 순). 닉네임·이메일은 일부만 맞아도, 휴대폰은 전체 번호가 맞으면 찾는다 */
export async function selectCustomers(
  db: DbReader,
  query: string,
): Promise<ListResult<CustomerRow>> {
  const pattern = containsPattern(query);
  const phone = normalizePhone(query);
  const where: SQL | undefined = query
    ? or(
        ilike(customers.nickname, pattern),
        ilike(profiles.email, pattern),
        phone ? eq(customers.phone, phone) : undefined,
      )
    : undefined;
  const rows = await db
    .select({
      customerId: customers.id,
      nickname: customers.nickname,
      phone: customers.phone,
      createdAt: customers.createdAt,
      withdrawnAt: customers.withdrawnAt,
      ...reservationCounts,
    })
    .from(customers)
    .innerJoin(profiles, eq(profiles.id, customers.userId))
    .leftJoin(reservations, eq(reservations.customerId, customers.id))
    .where(where)
    .groupBy(customers.id)
    .orderBy(desc(customers.createdAt))
    .limit(ADMIN_LIST_LIMIT + 1);
  return toListResult(rows);
}

export type OwnerRow = {
  ownerId: string;
  name: string;
  phone: string;
  createdAt: Date;
  withdrawnAt: Date | null;
  /** 샵은 가입 때 같이 만들어진다. 없으면 null */
  shopId: string | null;
  shopName: string | null;
  shopStatus: ShopStatus | null;
  slotCount: number;
};

/** 원장님 목록(최근 가입 순). 이름·샵 이름·이메일은 일부만 맞아도, 휴대폰은 전체 번호가 맞으면 찾는다 */
export async function selectOwners(db: DbReader, query: string): Promise<ListResult<OwnerRow>> {
  const pattern = containsPattern(query);
  const phone = normalizePhone(query);
  const where: SQL | undefined = query
    ? or(
        ilike(owners.name, pattern),
        ilike(shops.name, pattern),
        ilike(profiles.email, pattern),
        phone ? eq(owners.phone, phone) : undefined,
      )
    : undefined;
  const rows = await db
    .select({
      ownerId: owners.id,
      name: owners.name,
      phone: owners.phone,
      createdAt: owners.createdAt,
      withdrawnAt: owners.withdrawnAt,
      shopId: shops.id,
      shopName: shops.name,
      shopStatus: shops.status,
      slotCount: count(slots.id),
    })
    .from(owners)
    .innerJoin(profiles, eq(profiles.id, owners.userId))
    .leftJoin(shops, eq(shops.ownerId, owners.id))
    .leftJoin(slots, eq(slots.shopId, shops.id))
    .where(where)
    .groupBy(owners.id, shops.id)
    .orderBy(desc(owners.createdAt))
    .limit(ADMIN_LIST_LIMIT + 1);
  // DB의 check 제약이 정해 둔 상태만 허용한다
  return toListResult(rows.map((row) => ({ ...row, shopStatus: row.shopStatus as ShopStatus })));
}

export type CustomerReservationRow = {
  reservationId: string;
  code: string;
  status: ReservationStatus;
  visitResult: VisitResult | null;
  shopName: string;
  menuName: string;
  startAt: Date;
  amount: number;
};

export type CustomerDetail = {
  customerId: string;
  nickname: string;
  phone: string | null;
  email: string;
  createdAt: Date;
  withdrawnAt: Date | null;
  /** 선택 동의 두 개(관심 동네·찜한 샵 새 매물 알림, 이벤트·혜택, #267) */
  consents: OptionalConsents;
  reservationCount: number;
  cancelCount: number;
  noShowCount: number;
  /** 시작 시각이 늦은 순서로 최근 RECENT_RESERVATIONS건 */
  reservations: CustomerReservationRow[];
};

/** 고객 상세. 전체 번호와 이메일은 여기서만 읽는다. 없으면 null */
export async function selectCustomerDetail(
  db: DbReader,
  customerId: string,
): Promise<CustomerDetail | null> {
  const [customer] = await db
    .select({
      customerId: customers.id,
      userId: customers.userId,
      nickname: customers.nickname,
      phone: customers.phone,
      email: profiles.email,
      createdAt: customers.createdAt,
      withdrawnAt: customers.withdrawnAt,
    })
    .from(customers)
    .innerJoin(profiles, eq(profiles.id, customers.userId))
    .where(eq(customers.id, customerId));
  if (!customer) return null;

  const { userId, ...info } = customer;
  const consents = await readOptionalConsents(db, userId, 'customer');
  const [counts] = await db
    .select(reservationCounts)
    .from(reservations)
    .where(eq(reservations.customerId, customerId));
  const rows = await db
    .select({
      reservationId: reservations.id,
      code: reservations.code,
      status: reservations.status,
      visitResult: reservations.visitResult,
      shopName: shops.name,
      menuName: slots.menuName,
      startAt: slots.startAt,
      amount: orders.amount,
    })
    .from(reservations)
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .innerJoin(shops, eq(shops.id, slots.shopId))
    .innerJoin(orders, eq(orders.id, reservations.orderId))
    .where(eq(reservations.customerId, customerId))
    .orderBy(desc(slots.startAt))
    .limit(RECENT_RESERVATIONS);

  return {
    ...info,
    consents,
    ...counts,
    // DB의 check 제약이 정해 둔 값만 허용한다
    reservations: rows.map((row) => ({
      ...row,
      status: row.status as ReservationStatus,
      visitResult: row.visitResult as VisitResult | null,
    })),
  };
}
