// 매물 테이블 (docs/schema-v1.md 3장, X-301, X-302, X-304, S-201~S-209).
// DB에는 일이 일어날 때만 상태를 바꿔 저장하고, 시간이 지나서 바뀌는 상태는 조회할 때 계산한다
// (정민석 src/features/slot-status/, 연결 #16, #57).
// 같은 샵의 시간 겹침을 막는 EXCLUDE 제약(S-209)은 Drizzle로 표현할 수 없어서 마이그레이션 SQL에 직접 쓴다.

import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core';

import { SERVICE_TYPE_KEYS } from '@/server/policy/catalog';

import { customers, profiles } from './accounts';
import { menus, shops } from './shops';
import { createdAt, inValues, timestamptz, updatedAt } from './types';

/** 매물의 저장 상태. 화면 상태 6개(예약대기·게시중·예약됨·마감·취소·완료)와 같은 이름을 쓴다 */
export const SLOT_STATUSES = [
  'scheduled',
  'published',
  'reserved',
  'closed',
  'cancelled',
  'completed',
] as const;
export type SlotStatus = (typeof SLOT_STATUSES)[number];

/** 원장님이 직접 마감한 사유: 다른 곳 예약 / 잘못 올림 / 기타 */
export const SLOT_CLOSE_REASONS = ['other_channel', 'mistake', 'other'] as const;
export type SlotCloseReason = (typeof SLOT_CLOSE_REASONS)[number];

/** 매물 */
export const slots = pgTable(
  'slots',
  {
    id: uuid().primaryKey().defaultRandom(),
    shopId: uuid()
      .notNull()
      .references(() => shops.id),
    menuId: uuid()
      .notNull()
      .references(() => menus.id),
    // 아래 메뉴 정보는 등록 당시 값(메뉴를 고쳐도 매물은 그대로)
    serviceType: text().notNull(),
    menuName: text().notNull(),
    menuDescription: text(),
    listPrice: integer().notNull(),
    durationMinutes: integer().notNull(),
    // 10/20/30/40/50 중 하나(정책값). DB는 10~50만 확인한다
    discountRate: integer().notNull(),
    // 할인가 = 정가 × (1 − 할인율) 그대로, 원 미만 버림. 서버가 계산해서 저장(정렬·필터용)
    salePrice: integer().notNull(),
    newCustomerOnly: boolean().notNull().default(false),
    startAt: timestamptz().notNull(),
    // 시작 + 소요 시간
    endAt: timestamptz().notNull(),
    // 게시 시각. 시작 48시간 전보다 이르면 그때까지 '예약대기'
    publishAt: timestamptz().notNull(),
    status: text().notNull(),
    // 10분 홀딩(C-404): 홀딩한 고객과 만료 시각. 만료된 홀딩은 시각 비교로 무시한다
    holdCustomerId: uuid().references(() => customers.id),
    holdExpiresAt: timestamptz(),
    // 원장님 직접 마감(S-206)
    closedAt: timestamptz(),
    closeReason: text(),
    // 재등록(S-408)으로 만든 매물이면 원래 매물
    relistedFromSlotId: uuid().references((): AnyPgColumn => slots.id),
    createdBy: uuid()
      .notNull()
      .references(() => profiles.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('slots_status_check', inValues(t.status, SLOT_STATUSES)),
    check('slots_service_type_check', inValues(t.serviceType, SERVICE_TYPE_KEYS)),
    check('slots_discount_rate_check', sql`${t.discountRate} between 10 and 50`),
    check('slots_time_order_check', sql`${t.endAt} > ${t.startAt}`),
    check(
      'slots_close_reason_check',
      sql`${t.closeReason} is null or ${inValues(t.closeReason, SLOT_CLOSE_REASONS)}`,
    ),
    index('slots_status_start_at_idx').on(t.status, t.startAt),
    index('slots_shop_id_start_at_idx').on(t.shopId, t.startAt),
    index('slots_publish_at_idx').on(t.publishAt),
  ],
).enableRLS();
