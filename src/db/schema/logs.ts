// 기록 테이블 (docs/schema-v1.md 4장 location_use_logs).
// 위치정보법: 위치정보 이용 사실 확인자료를 자동으로 기록하고 6개월 이상 보관한다. 좌표는 저장하지 않는다.

import { check, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { profiles } from './accounts';
import { createdAt, inValues } from './types';

/** 위치를 쓴 목적: 내 주변 매물 / 지도 */
export const LOCATION_USE_PURPOSES = ['nearby_search', 'map'] as const;
export type LocationUsePurpose = (typeof LOCATION_USE_PURPOSES)[number];

/** 위치정보 이용 기록. "언제, 누가, 무엇에 위치를 썼는지"만 남긴다(logLocationUse, #47) */
export const locationUseLogs = pgTable(
  'location_use_logs',
  {
    id: uuid().primaryKey().defaultRandom(),
    // 로그인하지 않았으면 비운다
    userId: uuid().references(() => profiles.id),
    purpose: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check('location_use_logs_purpose_check', inValues(t.purpose, LOCATION_USE_PURPOSES)),
    // 6개월 지난 기록 정리용
    index('location_use_logs_created_at_idx').on(t.createdAt),
  ],
).enableRLS();
