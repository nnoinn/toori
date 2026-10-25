// 운영자 테이블 (docs/schema-v1.md 8장, A-104, A-101~A-105).

import { check, pgTable, text, uuid } from 'drizzle-orm/pg-core';

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
