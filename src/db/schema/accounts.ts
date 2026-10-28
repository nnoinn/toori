// 계정 테이블 (docs/schema-v1.md 1장, X-101, X-102).
// 로그인 정보(Supabase auth.users)는 사람마다 하나이고, 그 아래 고객 계정과 원장님 계정을 따로 둔다.
// 지금 어느 계정으로 들어왔는지는 DB가 아니라 httpOnly 쿠키(account_mode)로 기억한다(연결 #2, #47).

import { boolean, check, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { authUsers } from 'drizzle-orm/supabase';

import { createdAt, inValues, timestamptz } from './types';

/** 계정 종류(약관 동의 기록 등) */
export const ACCOUNT_TYPES = ['customer', 'owner'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** 약관 종류. marketing(광고성 정보 수신)만 선택이고 철회할 수 있다. age14는 고객 가입의 만 14세 이상 확인(#47, 10/25) */
export const TERMS_TYPES = [
  'service',
  'privacy',
  'location',
  'supplier',
  'marketing',
  'age14',
] as const;
export type TermsType = (typeof TERMS_TYPES)[number];

/** 로그인한 사람 (auth.users와 1:1). 처음 로그인할 때 로그인 콜백이 만든다 */
export const profiles = pgTable('profiles', {
  // auth.users.id와 같은 값. 로그인 정보를 지워도 기록 보관을 위해 따라 지우지 않는다(탈퇴는 withdrawn_at)
  id: uuid()
    .primaryKey()
    .references(() => authUsers.id),
  email: text().notNull(),
  // 관리자 여부. nnoinn이 DB에서 직접 바꾼다
  isAdmin: boolean().notNull().default(false),
  createdAt: createdAt(),
}).enableRLS();

/** 고객 계정 */
export const customers = pgTable('customers', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .unique('customers_user_id_unique')
    .references(() => profiles.id),
  nickname: text().notNull(),
  // 예약 확인·노쇼 연락용. 인증 없이 형식만 검사하고, 예약 전에 꼭 입력받는다
  phone: text(),
  // 관심 지역 알림을 마지막으로 보낸 시각(하루 1번 13시 묶음 발송 기준)
  lastInterestPushAt: timestamptz(),
  withdrawnAt: timestamptz(),
  createdAt: createdAt(),
}).enableRLS();

/** 원장님 계정. 가입(S-101) 때 shops·payout_accounts와 한 트랜잭션으로 만든다 */
export const owners = pgTable('owners', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .unique('owners_user_id_unique')
    .references(() => profiles.id),
  name: text().notNull(),
  phone: text().notNull(),
  withdrawnAt: timestamptz(),
  createdAt: createdAt(),
}).enableRLS();

/** 약관 동의 기록 */
export const termsAgreements = pgTable(
  'terms_agreements',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => profiles.id),
    accountType: text().notNull(),
    termsType: text().notNull(),
    // 약관 버전. 예: 2026-10-01 (정책값 TERMS_VERSIONS)
    version: text().notNull(),
    agreedAt: timestamptz().notNull().defaultNow(),
    // 동의 철회 시각. 선택 동의(marketing)만 철회할 수 있다
    withdrawnAt: timestamptz(),
  },
  (t) => [
    check('terms_agreements_account_type_check', inValues(t.accountType, ACCOUNT_TYPES)),
    check('terms_agreements_terms_type_check', inValues(t.termsType, TERMS_TYPES)),
  ],
).enableRLS();
