// 매물 테이블 (docs/schema-v1.md 3장, X-301, X-302, X-304, S-201~S-209).
// DB에는 일이 일어날 때만 상태를 바꿔 저장하고, 시간이 지나서 바뀌는 상태는 조회할 때 계산한다
// (정민석 src/features/slot-status/, 연결 #16, #57).
// 같은 샵의 시간 겹침을 막는 EXCLUDE 제약(S-209)은 Drizzle로 표현할 수 없어서 마이그레이션 SQL에 직접 쓴다.
// 시간대 매물(slot_windows, #308)끼리의 겹침과 시간대·한 시술 매물 사이의 겹침도 마이그레이션 0011의 SQL(EXCLUDE·트리거)이 막는다.

import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { SERVICE_TYPE_KEYS } from '@/server/policy/catalog';

import { customers, profiles } from './accounts';
import { menus, shops } from './shops';
import { createdAt, inValues, timestamptz, updatedAt } from './types';

/** 매물의 저장 상태. 화면 상태 6개(게시예정·게시중·예약됨·마감·취소·완료)와 같은 이름을 쓴다 */
export const SLOT_STATUSES = [
  'scheduled',
  'published',
  'reserved',
  'closed',
  'cancelled',
  'completed',
] as const;
export type SlotStatus = (typeof SLOT_STATUSES)[number];

/**
 * 마감 사유: 다른 곳 예약 / 잘못 올림 / 기타(원장님이 직접 고름, S-206) /
 * 결제 없이 홀딩 끝남(손님이 시간대 안에 만든 칸을 결제 없이 비움, #308 ④ 11/11. 원장님 목록·통계에서는 뺀다)
 */
export const SLOT_CLOSE_REASONS = ['other_channel', 'mistake', 'other', 'hold_released'] as const;
export type SlotCloseReason = (typeof SLOT_CLOSE_REASONS)[number];

/** 시간대 매물의 저장 상태: 게시예정·게시중·마감(#308). 시간이 지나서 마감되는 것은 매물처럼 조회할 때 계산한다 */
export const SLOT_WINDOW_STATUSES = ['scheduled', 'published', 'closed'] as const;
export type SlotWindowStatus = (typeof SLOT_WINDOW_STATUSES)[number];

/**
 * 시간대 매물 (S-201 두 번째 방식, #308, 11/10·11/11 결정). 원장님이 켠 칸이 이어진 묶음 하나가 한 줄이다.
 * 고객이 [예약하기]를 누르면 고른 서비스·시작 시각으로 매물(slots) 한 칸을 만들어 홀딩한다(slots.window_id).
 * 나중에 한 시술 매물을 시간대로 합칠 수 있게, 서비스 하나에 시간대 길이 = 소요 시간인 경우도 담는다(서비스 개수 조건이 없다)
 */
export const slotWindows = pgTable(
  'slot_windows',
  {
    id: uuid().primaryKey().defaultRandom(),
    shopId: uuid()
      .notNull()
      .references(() => shops.id),
    startAt: timestamptz().notNull(),
    endAt: timestamptz().notNull(),
    // 게시 시각. 시간대 시작 48시간 전보다 이르면 그때까지 '게시예정'(매물과 같다)
    publishAt: timestamptz().notNull(),
    status: text().notNull(),
    // 시간대 전체에 켠다(안에서 만든 매물도 같은 값)
    newCustomerOnly: boolean().notNull().default(false),
    // 원장님 직접 마감(S-206과 같은 사유)
    closedAt: timestamptz(),
    closeReason: text(),
    createdBy: uuid()
      .notNull()
      .references(() => profiles.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('slot_windows_status_check', inValues(t.status, SLOT_WINDOW_STATUSES)),
    check('slot_windows_time_order_check', sql`${t.endAt} > ${t.startAt}`),
    check(
      'slot_windows_close_reason_check',
      sql`${t.closeReason} is null or ${inValues(t.closeReason, SLOT_CLOSE_REASONS)}`,
    ),
    index('slot_windows_shop_id_start_at_idx').on(t.shopId, t.startAt),
    index('slot_windows_status_start_at_idx').on(t.status, t.startAt),
    index('slot_windows_publish_at_idx').on(t.publishAt),
  ],
).enableRLS();

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
    // 게시 시각. 시작 48시간 전보다 이르면 그때까지 '게시예정'
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
    // 시간대 매물 안에서 고객이 [예약하기]로 만든 매물이면 그 시간대(#308). 한 시술 매물은 비어 있다
    windowId: uuid().references(() => slotWindows.id),
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
    index('slots_window_id_idx').on(t.windowId),
  ],
).enableRLS();

/**
 * 시간대 매물에 올린 서비스(#308). 서비스마다 할인율을 따로 둔다.
 * 메뉴 정보는 올릴 때 값을 저장한다(매물처럼 나중에 메뉴를 고쳐도 올린 값은 그대로)
 */
export const slotWindowMenus = pgTable(
  'slot_window_menus',
  {
    id: uuid().primaryKey().defaultRandom(),
    windowId: uuid()
      .notNull()
      .references(() => slotWindows.id),
    menuId: uuid()
      .notNull()
      .references(() => menus.id),
    serviceType: text().notNull(),
    menuName: text().notNull(),
    menuDescription: text(),
    listPrice: integer().notNull(),
    durationMinutes: integer().notNull(),
    // 10/20/30/40/50 중 하나(정책값). DB는 10~50만 확인한다
    discountRate: integer().notNull(),
    // 할인가 = 정가 × (1 − 할인율) 그대로, 원 미만 버림. 서버가 계산해서 저장
    salePrice: integer().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    // 한 시간대에 같은 메뉴는 한 번만
    unique('slot_window_menus_window_id_menu_id_unique').on(t.windowId, t.menuId),
    check('slot_window_menus_service_type_check', inValues(t.serviceType, SERVICE_TYPE_KEYS)),
    check('slot_window_menus_discount_rate_check', sql`${t.discountRate} between 10 and 50`),
    check('slot_window_menus_duration_check', sql`${t.durationMinutes} > 0`),
  ],
).enableRLS();
