// 결제·예약 테이블 (docs/schema-v1.md 4장, X-201, X-204, C-404~C-406, S-405).
// 주문 상태를 단계별로 남겨서, 결제는 됐는데 저장이 실패한 경우를 찾아 복구할 수 있게 한다(C-406).

import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core';

import { customers, profiles } from './accounts';
import { coupons } from './refunds';
import { slots } from './slots';
import { createdAt, inValues, timestamptz, updatedAt } from './types';

/** 주문 상태: 결제 대기 / 결제 확인 / 예약 확정 / 실패 / 자동 취소 */
export const ORDER_STATUSES = ['pending', 'paid', 'confirmed', 'failed', 'auto_cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** 예약 상태: 예정 / 취소 / 이용 완료 */
export const RESERVATION_STATUSES = ['confirmed', 'cancelled', 'completed'] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** 방문 결과(S-405). 노쇼는 매물 상태가 아니라 예약에 기록한다 */
export const VISIT_RESULTS = ['visited', 'no_show'] as const;
export type VisitResult = (typeof VISIT_RESULTS)[number];

/** 취소한 쪽: 고객 / 원장님 귀책 / 자동 / 운영자 */
export const CANCEL_ACTORS = ['customer', 'owner_fault', 'system', 'admin'] as const;
export type CancelActor = (typeof CANCEL_ACTORS)[number];

/** 주문(결제 한 건). 한 매물에 실패한 주문이 여러 개 있을 수 있다 */
export const orders = pgTable(
  'orders',
  {
    id: uuid().primaryKey().defaultRandom(),
    // 포트원에 넘기는 우리 결제 번호
    paymentId: text().notNull().unique('orders_payment_id_unique'),
    slotId: uuid()
      .notNull()
      .references(() => slots.id),
    customerId: uuid()
      .notNull()
      .references(() => customers.id),
    // 매물 할인가(당시 값)
    salePrice: integer().notNull(),
    couponId: uuid().references((): AnyPgColumn => coupons.id),
    // 쿠폰으로 뺀 금액
    couponAmount: integer().notNull().default(0),
    // 실제 결제액 = 할인가 − 쿠폰. 포트원 검증 기준
    amount: integer().notNull(),
    // 결제 버튼 위 환불 규정 필수 동의(C-402). 환불 분쟁 때 증거로 쓴다
    refundPolicyVersion: text().notNull(),
    refundPolicyAgreedAt: timestamptz().notNull(),
    status: text().notNull(),
    // 포트원에서 받은 결제 상태
    pgStatus: text(),
    payMethod: text(),
    paidAt: timestamptz(),
    failureCode: text(),
    failureMessage: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('orders_status_check', inValues(t.status, ORDER_STATUSES)),
    index('orders_customer_id_idx').on(t.customerId),
    index('orders_status_idx').on(t.status),
  ],
).enableRLS();

/** 예약. 매물 하나에 예약 하나(취소되면 재등록은 새 매물) */
export const reservations = pgTable(
  'reservations',
  {
    id: uuid().primaryKey().defaultRandom(),
    // 예약번호: 영문 대문자+숫자 8자리, 0/O·1/I 제외. 코드에서 만든다(DB check 없음, #64)
    code: text().notNull().unique('reservations_code_unique'),
    slotId: uuid()
      .notNull()
      .unique('reservations_slot_id_unique')
      .references(() => slots.id),
    orderId: uuid()
      .notNull()
      .unique('reservations_order_id_unique')
      .references(() => orders.id),
    customerId: uuid()
      .notNull()
      .references(() => customers.id),
    status: text().notNull(),
    visitResult: text(),
    // 서비스 시작 이후에만 기록할 수 있다
    visitRecordedAt: timestamptz(),
    visitRecordedBy: uuid().references(() => profiles.id),
    cancelledAt: timestamptz(),
    cancelActor: text(),
    cancelReason: text(),
    // 취소할 때 시작까지 남은 시간. 원장님 귀책 취소 제재 기준을 정할 데이터
    hoursBeforeStartAtCancel: numeric({ mode: 'number' }),
    createdAt: createdAt(),
  },
  (t) => [
    check('reservations_status_check', inValues(t.status, RESERVATION_STATUSES)),
    check(
      'reservations_visit_result_check',
      sql`${t.visitResult} is null or ${inValues(t.visitResult, VISIT_RESULTS)}`,
    ),
    check(
      'reservations_cancel_actor_check',
      sql`${t.cancelActor} is null or ${inValues(t.cancelActor, CANCEL_ACTORS)}`,
    ),
    index('reservations_customer_id_idx').on(t.customerId),
    index('reservations_status_idx').on(t.status),
  ],
).enableRLS();

/** 포트원 웹훅 수신 기록. 같은 웹훅이 여러 번 와도 한 번만 처리한다(X-204) */
export const webhookEvents = pgTable('webhook_events', {
  id: uuid().primaryKey().defaultRandom(),
  webhookId: text().notNull().unique('webhook_events_webhook_id_unique'),
  type: text().notNull(),
  payload: jsonb().notNull(),
  receivedAt: timestamptz().notNull().defaultNow(),
  processedAt: timestamptz(),
  result: text(),
}).enableRLS();
