// 샵 테이블 (docs/schema-v1.md 2장, S-101~S-107, A-101).
// 통신판매업 신고번호는 받지 않는다(10/13 결정).

import { sql } from 'drizzle-orm';
import { check, date, index, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { SERVICE_TYPE_KEYS, SHOP_CATEGORY_KEYS } from '@/server/policy/catalog';

import { owners, profiles } from './accounts';
import { createdAt, geographyPoint, inValues, timestamptz, updatedAt } from './types';

/** 입점 상태(연결 #13, #50): 승인 대기 / 승인 / 반려 */
export const SHOP_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ShopStatus = (typeof SHOP_STATUSES)[number];

/** 토스페이먼츠 지급대행 셀러 상태. approved일 때만 지급을 요청한다 */
export const PG_SELLER_STATUSES = ['not_registered', 'requested', 'approved', 'rejected'] as const;
export type PgSellerStatus = (typeof PG_SELLER_STATUSES)[number];

/** 샵 이미지 종류: 대표 1장 / 스타일(최대 10장) */
export const SHOP_IMAGE_KINDS = ['main', 'style'] as const;
export type ShopImageKind = (typeof SHOP_IMAGE_KINDS)[number];

/** 요일별 영업시간. weekday 0=일 ~ 6=토, 시각은 한국 시간. 형식은 저장 전에 zod로 검사한다 */
export type BusinessHours = (
  { weekday: number; open: string; close: string } | { weekday: number; closed: true }
)[];

/** 샵(원장님 프로필) */
export const shops = pgTable(
  'shops',
  {
    id: uuid().primaryKey().defaultRandom(),
    // MVP는 원장님 하나에 샵 하나
    ownerId: uuid()
      .notNull()
      .unique('shops_owner_id_unique')
      .references(() => owners.id),
    name: text().notNull(),
    category: text().notNull(),
    phone: text().notNull(),
    // 도로명 주소(좌표 변환 기준). 좌표·지역은 서버가 geocodeAddress(#51)로 만든다
    roadAddress: text().notNull(),
    jibunAddress: text(),
    addressDetail: text(),
    sido: text().notNull(),
    sigungu: text().notNull(),
    // 지역 필터·동네 선택·관심 지역 기준(X-502)
    sigunguCode: text().notNull(),
    location: geographyPoint().notNull(),
    // 가입 때는 빈 목록으로 시작하고 매장 설정(O2)에서 입력한다(#47)
    businessHours: jsonb()
      .$type<BusinessHours>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    description: text(),
    instagramUrl: text(),
    naverPlaceUrl: text(),
    // 사업자 정보(입점 심사). 승인 뒤에는 운영자만 고친다(#50)
    businessName: text().notNull(),
    representativeName: text().notNull(),
    businessRegistrationNumber: text().notNull(),
    openedOn: date({ mode: 'string' }).notNull(),
    // 비공개 버킷 business-docs 안의 경로
    businessDocPath: text().notNull(),
    status: text().notNull().default('pending'),
    rejectionReason: text(),
    // 입점 신청(다시 신청 포함) 시각
    appliedAt: timestamptz().notNull().defaultNow(),
    reviewedAt: timestamptz(),
    reviewedBy: uuid().references(() => profiles.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('shops_category_check', inValues(t.category, SHOP_CATEGORY_KEYS)),
    check('shops_status_check', inValues(t.status, SHOP_STATUSES)),
    index('shops_location_idx').using('gist', t.location),
    index('shops_status_idx').on(t.status),
    index('shops_sigungu_code_idx').on(t.sigunguCode),
  ],
).enableRLS();

/** 정산 계좌 (샵과 1:1). 민감 정보라 샵과 테이블을 나눈다. 로그에 남기지 않는다 */
export const payoutAccounts = pgTable(
  'payout_accounts',
  {
    id: uuid().primaryKey().defaultRandom(),
    shopId: uuid()
      .notNull()
      .unique('payout_accounts_shop_id_unique')
      .references(() => shops.id),
    bankCode: text().notNull(),
    // 계좌번호 암호문(AES-256-GCM, 키는 서버 환경변수 PAYOUT_ACCOUNT_ENCRYPTION_KEY)
    accountNumberEncrypted: text().notNull(),
    // 원장님 화면 표시용 뒷자리
    accountLast4: text().notNull(),
    accountHolder: text().notNull(),
    pgSellerId: text(),
    pgSellerStatus: text().notNull().default('not_registered'),
    pgSellerCheckedAt: timestamptz(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('payout_accounts_pg_seller_status_check', inValues(t.pgSellerStatus, PG_SELLER_STATUSES)),
  ],
).enableRLS();

/** 메뉴·가격표. 지우지 않고 숨긴다(hidden_at). 숨겨도 이미 올린 매물·예약은 그대로 */
export const menus = pgTable(
  'menus',
  {
    id: uuid().primaryKey().defaultRandom(),
    shopId: uuid()
      .notNull()
      .references(() => shops.id),
    // 업종별 고정 목록(정책값 SERVICE_TYPES_BY_CATEGORY) 중 하나
    serviceType: text().notNull(),
    name: text().notNull(),
    description: text(),
    // 정가(원)
    listPrice: integer().notNull(),
    durationMinutes: integer().notNull(),
    sortOrder: integer().notNull(),
    hiddenAt: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check('menus_service_type_check', inValues(t.serviceType, SERVICE_TYPE_KEYS))],
).enableRLS();

/** 대표·스타일 이미지 */
export const shopImages = pgTable(
  'shop_images',
  {
    id: uuid().primaryKey().defaultRandom(),
    shopId: uuid()
      .notNull()
      .references(() => shops.id),
    kind: text().notNull(),
    // 공개 버킷 shop-images 안의 경로
    storagePath: text().notNull(),
    // 어떤 메뉴의 스타일인지(선택)
    menuId: uuid().references(() => menus.id),
    sortOrder: integer().notNull(),
    createdAt: createdAt(),
  },
  (t) => [check('shop_images_kind_check', inValues(t.kind, SHOP_IMAGE_KINDS))],
).enableRLS();
