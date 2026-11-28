// 알림·관심 테이블 (docs/schema-v1.md 7장, X-505-1, S-404, S-400, C-601, C-602, C-209, C-211).
// 고객의 현재 위치와 고른 동네는 DB에 저장하지 않는다(브라우저 쿠키, #19 D9).

import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';

import { ACCOUNT_TYPES, customers, profiles } from './accounts';
import { shops } from './shops';
import { slots, slotWindows } from './slots';
import { createdAt, inValues, timestamptz } from './types';

/** 알림 채널. 앱 단계에서 app_push를 더한다 */
export const NOTIFICATION_CHANNELS = ['web_push'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/**
 * 푸시 알림 보낸 결과. no_device: 푸시 알림을 켠 기기가 없어서 보내지 않았다(알림함에는 남는다, #371).
 * 화면 안내(투리를 보고 있을 때 위 가운데 5초)는 기기와 상관없이 1분마다 새 알림을 확인해서 띄운다
 */
export const NOTIFICATION_STATUSES = ['sent', 'failed', 'no_device'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

/** 웹 푸시 구독. 기기(endpoint)+계정 종류(고객/원장님)마다 하나다. 한 기기에서 켜 둔 계정의 알림을 모두 받는다(#131) */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => profiles.id),
    accountType: text().notNull(),
    endpoint: text().notNull(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    // 기기 정보
    userAgent: text(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('push_subscriptions_endpoint_account_type_unique').on(t.endpoint, t.accountType),
    check('push_subscriptions_account_type_check', inValues(t.accountType, ACCOUNT_TYPES)),
  ],
).enableRLS();

/**
 * 알림 기록이자 알림함(#371). 받는 계정마다 늘 한 줄 남기고(푸시 알림을 켠 기기가 없어도), 최근 90일(NOTIFICATION_INBOX_DAYS)을
 * 알림함에 보여 준 뒤 매일 정리 작업으로 지운다. dedupe_key로 같은 알림을 두 번 남기거나 보내지 않는다
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid().primaryKey().defaultRandom(),
    // 받는 사람
    userId: uuid()
      .notNull()
      .references(() => profiles.id),
    accountType: text().notNull(),
    // 예: reservation.confirmed, reservation.reminder, shop.approved
    event: text().notNull(),
    channel: text().notNull(),
    // 예: reminder:15m:예약ID
    dedupeKey: text().notNull().unique('notifications_dedupe_key_unique'),
    // 알림함에 보이는 제목·내용·누르면 열 주소. { title, body, url }
    payload: jsonb().notNull(),
    status: text().notNull(),
    error: text(),
    // 알림함에서 읽은 시각. 비어 있으면 안 읽음(종의 숫자, #371)
    readAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    check('notifications_account_type_check', inValues(t.accountType, ACCOUNT_TYPES)),
    check('notifications_channel_check', inValues(t.channel, NOTIFICATION_CHANNELS)),
    check('notifications_status_check', inValues(t.status, NOTIFICATION_STATUSES)),
    // 알림함(받는 사람·계정 종류마다 최근 순)과 안 읽은 수를 이 순서로 찾는다(#371)
    index('notifications_inbox_idx').on(t.userId, t.accountType, t.createdAt, t.id),
  ],
).enableRLS();

/** 관심 동네 */
export const interestAreas = pgTable(
  'interest_areas',
  {
    id: uuid().primaryKey().defaultRandom(),
    customerId: uuid()
      .notNull()
      .references(() => customers.id),
    sigunguCode: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique('interest_areas_customer_sigungu_unique').on(t.customerId, t.sigunguCode)],
).enableRLS();

/** 관심 샵 (C-209, C-211). 화면 이름은 '찜'에서 '관심'으로 바뀌었고(3단계 C-211), 표 이름은 그대로 둔다(#616) */
export const favorites = pgTable(
  'favorites',
  {
    id: uuid().primaryKey().defaultRandom(),
    customerId: uuid()
      .notNull()
      .references(() => customers.id),
    shopId: uuid()
      .notNull()
      .references(() => shops.id),
    createdAt: createdAt(),
  },
  (t) => [unique('favorites_customer_shop_unique').on(t.customerId, t.shopId)],
).enableRLS();

/**
 * 관심 매물 (C-211, #616, 11/27). 한 시술 매물(slot_id)이나 시간대 매물(window_id) 중 하나에 관심 표시한다(목록 카드가 따로 있어서).
 * 끄면 줄을 지운다(관심 샵과 같다). 매물이 예약·마감돼도 줄은 그대로 두고 화면이 '마감된 매물' 칸으로 옮긴다.
 * 시간대 안에서 손님이 홀딩해 만든 매물(slots.window_id 있음)은 카드가 없어서 저장 함수가 막는다. 고객이 탈퇴하면 지운다
 */
export const slotInterests = pgTable(
  'slot_interests',
  {
    id: uuid().primaryKey().defaultRandom(),
    customerId: uuid()
      .notNull()
      .references(() => customers.id),
    slotId: uuid().references(() => slots.id),
    windowId: uuid().references(() => slotWindows.id),
    createdAt: createdAt(),
  },
  (t) => [
    check('slot_interests_target_check', sql`(${t.slotId} is null) <> (${t.windowId} is null)`),
    // 빈 값끼리는 같지 않아서, 매물 관심과 시간대 관심이 서로를 막지 않는다
    unique('slot_interests_customer_slot_unique').on(t.customerId, t.slotId),
    unique('slot_interests_customer_window_unique').on(t.customerId, t.windowId),
    // 관심 화면 목록(고객마다 최근 순)
    index('slot_interests_customer_created_at_idx').on(t.customerId, t.createdAt),
  ],
).enableRLS();
