// 회원 탈퇴 기록 (docs/schema-v1.md 1장, #154, 11/23 nnoinn 승인, 마이그레이션 0023).
// 샵 상태 목록(shops.ts)을 같이 쓰는데 shops.ts가 accounts.ts를 불러오므로, 서로 불러오지 않게 따로 둔다.

import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { ACCOUNT_TYPES, customers, owners, profiles } from './accounts';
import { SHOP_STATUSES } from './shops';
import { inValues, timestamptz } from './types';

/** 되살릴 때 돌려놓을 수 있는 샵 상태(탈퇴 말고 나머지) */
export const RESTORABLE_SHOP_STATUSES = SHOP_STATUSES.filter((status) => status !== 'withdrawn');

/**
 * 회원 탈퇴 한 번이 한 줄이다. 한 계정이 탈퇴·되살리기를 여러 번 해도 줄마다 남는다.
 * 되살리면 restored_at, 30일이 지나 개인정보를 지우면 erased_at을 채우고 그 줄은 끝난다.
 * 탈퇴 여부 자체는 지금처럼 customers.withdrawn_at·owners.withdrawn_at으로 보고, 되살리기·30일 뒤 지우기·운영자 확인이 이 표를 본다
 */
export const accountWithdrawals = pgTable(
  'account_withdrawals',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => profiles.id),
    // customer / owner
    accountType: text().notNull(),
    // 계정 종류에 맞는 하나만 채운다
    customerId: uuid().references(() => customers.id),
    ownerId: uuid().references(() => owners.id),
    // 탈퇴한 시각. 되살리기 기한은 이때부터 WITHDRAWAL_RESTORE_DAYS(30일)
    withdrawnAt: timestamptz().notNull(),
    restoredAt: timestamptz(),
    // 30일 뒤 개인정보를 지운 시각
    erasedAt: timestamptz(),
    // 원장님만: 되살릴 때 돌려놓을 샵 상태(승인 전에 탈퇴한 샵이 되살리면서 승인되지 않게)
    shopStatusBefore: text(),
    // 탈퇴로 없어진 안 쓴 쿠폰 수(고객), 일괄 마감한 판매 전 매물·시간대 수(원장님). 운영자 확인용
    forfeitedCouponCount: integer().notNull().default(0),
    closedSlotCount: integer().notNull().default(0),
  },
  (t) => [
    check('account_withdrawals_account_type_check', inValues(t.accountType, ACCOUNT_TYPES)),
    // 고객이면 고객 계정만, 원장님이면 원장님 계정과 되돌릴 샵 상태만 채운다
    check(
      'account_withdrawals_account_check',
      sql`(${t.accountType} = 'customer' and ${t.customerId} is not null and ${t.ownerId} is null and ${t.shopStatusBefore} is null) or (${t.accountType} = 'owner' and ${t.ownerId} is not null and ${t.customerId} is null and ${t.shopStatusBefore} is not null)`,
    ),
    check(
      'account_withdrawals_shop_status_before_check',
      sql`${t.shopStatusBefore} is null or ${inValues(t.shopStatusBefore, RESTORABLE_SHOP_STATUSES)}`,
    ),
    // 되살린 줄은 지우지 않고, 지운 줄은 되살리지 않는다
    check('account_withdrawals_end_check', sql`${t.restoredAt} is null or ${t.erasedAt} is null`),
    check(
      'account_withdrawals_count_check',
      sql`${t.forfeitedCouponCount} >= 0 and ${t.closedSlotCount} >= 0`,
    ),
    // 한 계정에 되살리지도 지우지도 않은 줄은 하나만
    uniqueIndex('account_withdrawals_open_customer_unique')
      .on(t.customerId)
      .where(sql`${t.restoredAt} is null and ${t.erasedAt} is null`),
    uniqueIndex('account_withdrawals_open_owner_unique')
      .on(t.ownerId)
      .where(sql`${t.restoredAt} is null and ${t.erasedAt} is null`),
    // 30일 뒤 지우기 예약 작업이 끝나지 않은 줄을 탈퇴 시각 순으로 찾는다
    index('account_withdrawals_open_idx')
      .on(t.withdrawnAt)
      .where(sql`${t.restoredAt} is null and ${t.erasedAt} is null`),
    index('account_withdrawals_user_id_idx').on(t.userId),
  ],
).enableRLS();
