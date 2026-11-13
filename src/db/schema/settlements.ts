// 정산 테이블 (docs/schema-v1.md 6장, X-205, X-206, A-105).
// 원장님 정산은 판매가(쿠폰 적용 전) 기준이다. 계산 당시의 비율·금액을 행에 그대로 저장한다.
// 투리는 돈을 직접 보내지 않는다(PG 지급대행). 지급 요청 번호와 결과만 기록한다(10/12).

import {
  type AnyPgColumn,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { orders } from './payments';
import { shops } from './shops';
import { createdAt, inValues, timestamptz } from './types';

/** 정산 거래 종류: 이용 완료 / 고객 취소 위약금 / 노쇼 / 합의 후 취소(판매가 × 50%, #320) */
export const SETTLEMENT_ITEM_KINDS = ['sale', 'penalty', 'no_show', 'agreed_cancel'] as const;
export type SettlementItemKind = (typeof SETTLEMENT_ITEM_KINDS)[number];

/** 정산 상태: 지급 전 / PG에 지급 요청 / 지급 완료 / 지급 실패(재요청 필요) */
export const SETTLEMENT_STATUSES = ['pending', 'requested', 'paid', 'failed'] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

/** 정산(기간별 묶음) */
export const settlements = pgTable(
  'settlements',
  {
    id: uuid().primaryKey().defaultRandom(),
    shopId: uuid()
      .notNull()
      .references(() => shops.id),
    // 정산 기간. 샵 하나 × 지급일 하나로 묶고, 기간은 그 샵의 직전 지급일 다음 날 ~ 지급일(#353, 11/12).
    // 첫 정산은 처음 묶이는 거래가 끝난 날부터. 이의제기로 늦게 들어온 거래는 서비스 날짜가 기간보다 앞설 수 있다
    periodStart: date({ mode: 'string' }).notNull(),
    periodEnd: date({ mode: 'string' }).notNull(),
    itemCount: integer().notNull(),
    totalBaseAmount: integer().notNull(),
    // 플랫폼 수수료 + VAT + 결제 수수료 + VAT 합
    totalFeeAmount: integer().notNull(),
    // 이번에 뗀 패널티
    penaltyDeducted: integer().notNull(),
    // 최종 지급액. 패널티를 떼고 0원이면 지급 요청 없이 paid로 끝낸다(payout_ref 없음, #353)
    payoutAmount: integer().notNull(),
    status: text().notNull(),
    paidAt: timestamptz(),
    // PG 지급대행 요청 번호(결과 확인·재요청용)
    payoutRef: text(),
    memo: text(),
    createdAt: createdAt(),
  },
  (t) => [
    check('settlements_status_check', inValues(t.status, SETTLEMENT_STATUSES)),
    // 같은 기간을 두 번 묶어 두 번 지급 요청하는 실수를 막는다(#64)
    unique('settlements_shop_period_unique').on(t.shopId, t.periodStart, t.periodEnd),
  ],
).enableRLS();

/** 거래별 정산 내역 (거래 하나에 한 줄) */
export const settlementItems = pgTable(
  'settlement_items',
  {
    id: uuid().primaryKey().defaultRandom(),
    shopId: uuid()
      .notNull()
      .references(() => shops.id),
    orderId: uuid()
      .notNull()
      .references((): AnyPgColumn => orders.id),
    kind: text().notNull(),
    // 판매가 기준 남은 금액: 이용 완료·노쇼 = 판매가, 고객 취소 = 판매가 × 위약금 비율(쿠폰과 무관)
    baseAmount: integer().notNull(),
    // 적용한 플랫폼 수수료율(당시 값, %). 오픈 기간은 0
    feeRate: integer().notNull(),
    // 플랫폼 수수료(원 미만 버림)
    feeAmount: integer().notNull(),
    feeVat: integer().notNull(),
    // 원장님에게 받는 결제 수수료율(당시 값, 판매가의 N%)
    paymentFeeRate: numeric({ mode: 'number' }).notNull(),
    paymentFee: integer().notNull(),
    paymentFeeVat: integer().notNull(),
    // 이 거래로 원장님이 받을 금액
    payoutAmount: integer().notNull(),
    // 실제 PG 수수료(실제 결제액 기준). 투리 손익 계산용, 원장님 정산에는 쓰지 않는다.
    // PG 정산 자료가 와야 아는 값이라 묶을 때는 비워 두고, 자료가 오면 채운다(#353)
    pgFeeActual: integer(),
    // 투리가 부담한 쿠폰 금액. 투리 손익 계산용
    couponAmount: integer().notNull().default(0),
    // 어느 정산에 들어갔는지. 비어 있으면 정산 전
    settlementId: uuid().references(() => settlements.id),
    createdAt: createdAt(),
  },
  (t) => [
    check('settlement_items_kind_check', inValues(t.kind, SETTLEMENT_ITEM_KINDS)),
    index('settlement_items_shop_id_settlement_id_idx').on(t.shopId, t.settlementId),
    // 거래 하나에 한 줄. 묶기 작업이 두 번 돌거나 겹쳐 돌아도 같은 거래를 두 번 정산하지 않는다(#353)
    unique('settlement_items_order_id_unique').on(t.orderId),
  ],
).enableRLS();
