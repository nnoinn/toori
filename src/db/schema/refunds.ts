// 환불·쿠폰·패널티 테이블 (docs/schema-v1.md 5장, X-202, X-203, X-207, C-407, S-409).

import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { customers, profiles } from './accounts';
import { orders, reservations } from './payments';
import { settlements } from './settlements';
import { shops } from './shops';
import { createdAt, inValues, timestamptz } from './types';

/** 환불 사유: 고객 취소 / 원장님 귀책 / 자동 취소 / 운영자 예외 */
export const REFUND_REASONS = [
  'customer_cancel',
  'owner_fault',
  'auto_cancel',
  'admin_exception',
] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

/** 환불 기록 상태: 포트원을 부르기 전에 저장한 진행 중 / 끝남 */
export const REFUND_STATUSES = ['requested', 'done'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

/** 적용한 위약금 구간: 24시간 이상(30%) / 6~24시간(50%) / 6시간 미만(100%) */
export const REFUND_BANDS_DB = ['over_24h', '6h_to_24h', 'under_6h'] as const;
export type RefundBand = (typeof REFUND_BANDS_DB)[number];

/** 쿠폰 발급 사유. 지금은 원장님 귀책 보상만 쓴다. 초대 쿠폰(C-701, P2)을 만들 때 값을 더한다 */
export const COUPON_REASONS = ['owner_fault_compensation'] as const;
export type CouponReason = (typeof COUPON_REASONS)[number];

/** 환불 기록 */
export const refunds = pgTable(
  'refunds',
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references((): AnyPgColumn => orders.id),
    // 예약을 만들기 전에 결제를 취소하는 자동 취소(auto_cancel, C-406)에서는 비어 있다(#64)
    reservationId: uuid().references((): AnyPgColumn => reservations.id),
    reason: text().notNull(),
    status: text().notNull().default('done'),
    band: text(),
    // 적용한 위약금 비율(당시 값, %)
    penaltyRate: integer().notNull(),
    // 고객에게 돌려준 금액(실제 결제액 기준)
    refundAmount: integer().notNull(),
    // 남은 금액(위약금)
    penaltyAmount: integer().notNull(),
    pgCancellationId: text(),
    // 운영자 확인이 필요한 이유(포트원이 돌려준 금액이 계산과 다를 때). 비어 있으면 확인할 것 없음
    reviewReason: text(),
    // 진행 중(requested)에는 비어 있다
    processedAt: timestamptz(),
    // 운영자 처리일 때
    processedBy: uuid().references(() => profiles.id),
    createdAt: createdAt(),
  },
  (t) => [
    check('refunds_reason_check', inValues(t.reason, REFUND_REASONS)),
    check('refunds_status_check', inValues(t.status, REFUND_STATUSES)),
    check(
      'refunds_done_processed_check',
      sql`${t.status} <> 'done' or ${t.processedAt} is not null`,
    ),
    check('refunds_band_check', sql`${t.band} is null or ${inValues(t.band, REFUND_BANDS_DB)}`),
    // 한 예약에 고객 취소 환불 기록은 하나만
    uniqueIndex('refunds_customer_cancel_unique')
      .on(t.reservationId)
      .where(sql`${t.reason} = 'customer_cancel'`),
    // 정리 작업이 오래된 진행 중 기록을 찾을 때
    index('refunds_requested_created_at_idx')
      .on(t.createdAt)
      .where(sql`${t.status} = 'requested'`),
  ],
).enableRLS();

/** 쿠폰. 결제 1건에 1장, 비용은 투리가 부담한다 */
export const coupons = pgTable(
  'coupons',
  {
    id: uuid().primaryKey().defaultRandom(),
    customerId: uuid()
      .notNull()
      .references(() => customers.id),
    // 예: 3,000원(정책값)
    amount: integer().notNull(),
    reason: text().notNull(),
    // 원장님 귀책 보상일 때 원인 예약
    sourceReservationId: uuid().references((): AnyPgColumn => reservations.id),
    issuedAt: timestamptz().notNull(),
    // 발급 + 90일(정책값)
    expiresAt: timestamptz().notNull(),
    // 쓴 주문. 원장님 귀책 취소면 비워서 다시 쓸 수 있게 돌려준다
    usedOrderId: uuid().references((): AnyPgColumn => orders.id),
    usedAt: timestamptz(),
  },
  (t) => [
    check('coupons_reason_check', inValues(t.reason, COUPON_REASONS)),
    index('coupons_customer_id_expires_at_idx').on(t.customerId, t.expiresAt),
  ],
).enableRLS();

/** 원장님 귀책 취소 패널티. fully_collected_at이 비어 있으면 "남은 패널티" */
export const ownerPenalties = pgTable('owner_penalties', {
  id: uuid().primaryKey().defaultRandom(),
  shopId: uuid()
    .notNull()
    .references(() => shops.id),
  // 원인 예약
  reservationId: uuid()
    .notNull()
    .unique('owner_penalties_reservation_id_unique')
    .references((): AnyPgColumn => reservations.id),
  // 예: 5,000원(정책값)
  amount: integer().notNull(),
  // 지금까지 걷은 금액
  collectedAmount: integer().notNull().default(0),
  createdAt: createdAt(),
  fullyCollectedAt: timestamptz(),
}).enableRLS();

/** 패널티를 정산에서 뗀 기록 */
export const penaltyCollections = pgTable('penalty_collections', {
  id: uuid().primaryKey().defaultRandom(),
  penaltyId: uuid()
    .notNull()
    .references(() => ownerPenalties.id),
  settlementId: uuid()
    .notNull()
    .references(() => settlements.id),
  // 이번 정산에서 뗀 금액
  amount: integer().notNull(),
  createdAt: createdAt(),
}).enableRLS();
