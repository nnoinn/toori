// 운영자 기록 화면(#372 5장)의 조회. 이 화면에서만 쓴다.
// 처리 기록(admin_actions)과 열람 기록(admin_access_logs)을 운영자 이름(admin_profiles)과 대상 이름(샵·예약번호·회원 등)으로 보여준다.
// 시각(Date)은 sql`` 안에 직접 넣지 않고 gte·lt로 넘긴다(#346)

import 'server-only';

import { and, asc, count, desc, eq, gte, isNotNull, lt, or, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { getDb } from '@/db';
import {
  adminAccessLogs,
  adminActions,
  adminProfiles,
  customers,
  disputes,
  owners,
  profiles,
  reservations,
  settlements,
  shops,
} from '@/db/schema';

import { ADMIN_PAGE_SIZE, type PageResult, toPage } from '../lookup';
import { type LogParams, targetLabel, toKstRange } from './format';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

const disputeReservations = alias(reservations, 'dispute_reservation');
const settlementShops = alias(shops, 'settlement_shop');

/** 처리 기록 한 줄 */
export type ActionLogRow = {
  id: string;
  createdAt: Date;
  adminId: string;
  /** 운영자 이름. 프로필이 없으면 null(화면은 "운영자") */
  adminName: string | null;
  action: string;
  targetType: string;
  targetId: string;
  targetLabel: string | null;
  memo: string | null;
};

/** 열람 기록 한 줄 */
export type AccessLogRow = {
  id: string;
  createdAt: Date;
  adminId: string;
  adminName: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string | null;
  path: string;
  query: string | null;
  ip: string | null;
};

type Filters = Omit<LogParams, 'tab'>;

/** 처리 기록. 운영자·한 일·대상 종류·기간으로 거르고, 최근(또는 오래된) 순으로 한 쪽(20줄)씩 */
export async function selectActionLogs(
  db: DbReader,
  filters: Filters,
): Promise<PageResult<ActionLogRow>> {
  const t = adminActions;
  const { start, end } = toKstRange(filters.from, filters.to);
  const where: (SQL | undefined)[] = [
    filters.admin ? eq(t.adminId, filters.admin) : undefined,
    filters.kind ? eq(t.action, filters.kind) : undefined,
    filters.target ? eq(t.targetType, filters.target) : undefined,
    start ? gte(t.createdAt, start) : undefined,
    end ? lt(t.createdAt, end) : undefined,
  ];
  const condition = and(...where);
  // 쪽 수를 알려고 같은 조건으로 전체 수를 먼저 센다. 쪽 수보다 큰 쪽을 달라고 하면 마지막 쪽을 보여 준다
  const [{ total }] = await db.select({ total: count() }).from(t).where(condition);
  const paging = toPage(total, filters.page);
  const rows = await db
    .select({
      id: t.id,
      createdAt: t.createdAt,
      adminId: t.adminId,
      adminName: adminProfiles.name,
      action: t.action,
      targetType: t.targetType,
      targetId: t.targetId,
      memo: t.memo,
      shopName: shops.name,
      reservationCode: reservations.code,
      disputeReservationCode: disputeReservations.code,
      customerName: customers.name,
      ownerName: owners.name,
      settlementShopName: settlementShops.name,
      settlementPayoutDate: settlements.periodEnd,
    })
    .from(t)
    .leftJoin(adminProfiles, eq(adminProfiles.userId, t.adminId))
    .leftJoin(shops, and(eq(t.targetType, 'shop'), eq(shops.id, t.targetId)))
    .leftJoin(reservations, and(eq(t.targetType, 'reservation'), eq(reservations.id, t.targetId)))
    .leftJoin(disputes, and(eq(t.targetType, 'dispute'), eq(disputes.id, t.targetId)))
    .leftJoin(disputeReservations, eq(disputeReservations.id, disputes.reservationId))
    .leftJoin(customers, and(eq(t.targetType, 'customer'), eq(customers.id, t.targetId)))
    .leftJoin(owners, and(eq(t.targetType, 'owner'), eq(owners.id, t.targetId)))
    .leftJoin(settlements, and(eq(t.targetType, 'settlement'), eq(settlements.id, t.targetId)))
    .leftJoin(settlementShops, eq(settlementShops.id, settlements.shopId))
    .where(condition)
    .orderBy(
      ...(filters.sort === 'old' ? [asc(t.createdAt), asc(t.id)] : [desc(t.createdAt), desc(t.id)]),
    )
    .limit(ADMIN_PAGE_SIZE)
    .offset(paging.offset);
  return {
    total,
    page: paging.page,
    pageCount: paging.pageCount,
    rows: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      adminId: row.adminId,
      adminName: row.adminName,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      targetLabel: targetLabel(row.targetType, row),
      memo: row.memo,
    })),
  };
}

/** 열람 기록. 운영자·한 일·대상 종류·기간으로 거르고, 최근(또는 오래된) 순으로 한 쪽(20줄)씩. 접속 IP가 보인다 */
export async function selectAccessLogs(
  db: DbReader,
  filters: Filters,
): Promise<PageResult<AccessLogRow>> {
  const t = adminAccessLogs;
  const { start, end } = toKstRange(filters.from, filters.to);
  const where: (SQL | undefined)[] = [
    filters.admin ? eq(t.adminId, filters.admin) : undefined,
    filters.kind ? eq(t.action, filters.kind) : undefined,
    filters.target ? eq(t.targetType, filters.target) : undefined,
    start ? gte(t.createdAt, start) : undefined,
    end ? lt(t.createdAt, end) : undefined,
  ];
  const condition = and(...where);
  // 쪽 수를 알려고 같은 조건으로 전체 수를 먼저 센다. 쪽 수보다 큰 쪽을 달라고 하면 마지막 쪽을 보여 준다
  const [{ total }] = await db.select({ total: count() }).from(t).where(condition);
  const paging = toPage(total, filters.page);
  const rows = await db
    .select({
      id: t.id,
      createdAt: t.createdAt,
      adminId: t.adminId,
      adminName: adminProfiles.name,
      action: t.action,
      targetType: t.targetType,
      targetId: t.targetId,
      path: t.path,
      query: t.query,
      ip: t.ip,
      shopName: shops.name,
      reservationCode: reservations.code,
      disputeReservationCode: disputeReservations.code,
      customerName: customers.name,
      ownerName: owners.name,
      settlementShopName: settlementShops.name,
      settlementPayoutDate: settlements.periodEnd,
    })
    .from(t)
    .leftJoin(adminProfiles, eq(adminProfiles.userId, t.adminId))
    .leftJoin(shops, and(eq(t.targetType, 'shop'), eq(shops.id, t.targetId)))
    .leftJoin(reservations, and(eq(t.targetType, 'reservation'), eq(reservations.id, t.targetId)))
    .leftJoin(disputes, and(eq(t.targetType, 'dispute'), eq(disputes.id, t.targetId)))
    .leftJoin(disputeReservations, eq(disputeReservations.id, disputes.reservationId))
    .leftJoin(customers, and(eq(t.targetType, 'customer'), eq(customers.id, t.targetId)))
    .leftJoin(owners, and(eq(t.targetType, 'owner'), eq(owners.id, t.targetId)))
    .leftJoin(settlements, and(eq(t.targetType, 'settlement'), eq(settlements.id, t.targetId)))
    .leftJoin(settlementShops, eq(settlementShops.id, settlements.shopId))
    .where(condition)
    .orderBy(
      ...(filters.sort === 'old' ? [asc(t.createdAt), asc(t.id)] : [desc(t.createdAt), desc(t.id)]),
    )
    .limit(ADMIN_PAGE_SIZE)
    .offset(paging.offset);
  return {
    total,
    page: paging.page,
    pageCount: paging.pageCount,
    rows: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      adminId: row.adminId,
      adminName: row.adminName,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      targetLabel: targetLabel(row.targetType, row),
      path: row.path,
      query: row.query,
      ip: row.ip,
    })),
  };
}

/** 운영자 고르기 칸: 지금 운영자와, 그만뒀어도 프로필이 남은 운영자. 이름 순. 이메일은 보이지 않는다 */
export async function selectAdminsForFilter(
  db: DbReader,
): Promise<{ adminId: string; name: string | null }[]> {
  return db
    .select({ adminId: profiles.id, name: adminProfiles.name })
    .from(profiles)
    .leftJoin(adminProfiles, eq(adminProfiles.userId, profiles.id))
    .where(or(eq(profiles.isAdmin, true), isNotNull(adminProfiles.userId)))
    .orderBy(asc(adminProfiles.name), asc(profiles.id));
}
