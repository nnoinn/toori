// 운영자 테이블 (docs/schema-v1.md 8장, A-104, A-101~A-105).

import { check, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { profiles } from './accounts';
import { reservations } from './payments';
import { createdAt, inValues, timestamptz } from './types';

/** 이의제기 종류: 노쇼 이의 / 환불 예외 / 시작 후 문제 */
export const DISPUTE_TYPES = ['no_show', 'refund_exception', 'after_start'] as const;
export type DisputeType = (typeof DISPUTE_TYPES)[number];

/** 이의제기 상태 */
export const DISPUTE_STATUSES = ['open', 'resolved'] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

/** 이의제기 (A-104) */
export const disputes = pgTable(
  'disputes',
  {
    id: uuid().primaryKey().defaultRandom(),
    reservationId: uuid()
      .notNull()
      .references(() => reservations.id),
    type: text().notNull(),
    content: text().notNull(),
    status: text().notNull(),
    result: text(),
    handledBy: uuid().references(() => profiles.id),
    handledAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    check('disputes_type_check', inValues(t.type, DISPUTE_TYPES)),
    check('disputes_status_check', inValues(t.status, DISPUTE_STATUSES)),
  ],
).enableRLS();

/**
 * 운영자 작업 기록. 누가, 언제, 무엇을 했는지 남긴다.
 * action·target_type은 종류가 계속 늘어나서 check를 두지 않는다(#64).
 * 예: shop.approve, shop.reject, visit.override, refund.exception, settlement.payout_request
 */
export const adminActions = pgTable('admin_actions', {
  id: uuid().primaryKey().defaultRandom(),
  adminId: uuid()
    .notNull()
    .references(() => profiles.id),
  action: text().notNull(),
  // 예: shop, reservation, settlement
  targetType: text().notNull(),
  targetId: uuid().notNull(),
  memo: text(),
  createdAt: createdAt(),
}).enableRLS();

/**
 * 운영자 열람 기록 (#269, 11/8 결정). 운영자가 개인정보가 보이는 화면을 볼 때마다 한 줄 남긴다
 * (개인정보 안전성 확보조치 기준의 접속 기록). 1년 이상 보관하고 앱에서 고치거나 지우지 않는다.
 * 작업 기록(admin_actions)과 달리 목록·검색처럼 대상이 없는 열람과 접속 IP·검색어도 남긴다
 */
export const adminAccessLogs = pgTable(
  'admin_access_logs',
  {
    id: uuid().primaryKey().defaultRandom(),
    adminId: uuid()
      .notNull()
      .references(() => profiles.id),
    // 예: view(상세 보기), search(목록·검색). 종류가 늘 수 있어서 check를 두지 않는다(admin_actions와 같다)
    action: text().notNull(),
    // 예: customer, owner, shop, reservation. 목록·검색이면 list
    targetType: text().notNull(),
    // 상세면 대상 id, 목록·검색이면 비어 있다
    targetId: uuid(),
    // 본 화면 주소(검색어는 query에 따로 둔다)
    path: text().notNull(),
    // 목록·검색에서 쓴 검색어. 번호로 찾을 수도 있어서 개인정보로 다룬다
    query: text(),
    // 접속 IP(x-forwarded-for 첫 값). 모양이 이상해도 기록이 실패하지 않게 글자로 둔다
    ip: text(),
    createdAt: createdAt(),
  },
  (t) => [
    // 보관 기간이 지난 기록 찾기
    index('admin_access_logs_created_at_idx').on(t.createdAt),
    // 월 1회 이상 접근 점검(운영자별)
    index('admin_access_logs_admin_created_at_idx').on(t.adminId, t.createdAt),
  ],
).enableRLS();
