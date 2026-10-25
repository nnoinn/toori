// 알림·관심 테이블 (docs/schema-v1.md 7장, X-505-1, S-404, S-400, C-601, C-602, C-209).
// 고객의 현재 위치와 고른 동네는 DB에 저장하지 않는다(브라우저 쿠키, #19 D9).

import { check, jsonb, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';

import { ACCOUNT_TYPES, customers, profiles } from './accounts';
import { shops } from './shops';
import { createdAt, inValues } from './types';

/** 알림 채널. 앱 단계에서 app_push를 더한다 */
export const NOTIFICATION_CHANNELS = ['web_push'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** 알림 발송 결과 */
export const NOTIFICATION_STATUSES = ['sent', 'failed'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

/** 웹 푸시 구독. 어느 계정(고객/원장님)의 알림을 받는지 같이 저장한다 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => profiles.id),
    accountType: text().notNull(),
    endpoint: text().notNull().unique('push_subscriptions_endpoint_unique'),
    p256dh: text().notNull(),
    auth: text().notNull(),
    // 기기 정보
    userAgent: text(),
    createdAt: createdAt(),
  },
  (t) => [check('push_subscriptions_account_type_check', inValues(t.accountType, ACCOUNT_TYPES))],
).enableRLS();

/** 알림 발송 기록. dedupe_key로 같은 알림을 두 번 보내지 않는다 */
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
    payload: jsonb().notNull(),
    status: text().notNull(),
    error: text(),
    createdAt: createdAt(),
  },
  (t) => [
    check('notifications_account_type_check', inValues(t.accountType, ACCOUNT_TYPES)),
    check('notifications_channel_check', inValues(t.channel, NOTIFICATION_CHANNELS)),
    check('notifications_status_check', inValues(t.status, NOTIFICATION_STATUSES)),
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

/** 찜 (C-209, P1). 테이블만 먼저 만든다 */
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
