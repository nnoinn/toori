// 계정 테이블 (docs/schema-v1.md 1장, X-101, X-102).
// 로그인 정보(Supabase auth.users)는 사람마다 하나이고, 그 아래 고객 계정과 원장님 계정을 따로 둔다.
// 지금 어느 계정으로 들어왔는지는 DB가 아니라 httpOnly 쿠키(account_mode)로 기억한다(연결 #2, #47).

import { sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { createdAt, inValues, timestamptz } from './types';

/** 계정 종류(약관 동의 기록 등) */
export const ACCOUNT_TYPES = ['customer', 'owner'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/**
 * 약관 종류. age14는 고객 가입의 만 14세 이상 확인(#47, 10/25).
 * 선택이고 철회할 수 있는 동의는 둘이다: marketing(이벤트·혜택 광고성 정보 수신),
 * interest_alert(관심 동네·찜한 샵 새 매물 알림 수신, 광고성 정보로 보고 marketing과 따로 받는다, #267·#270, 11/8)
 */
export const TERMS_TYPES = [
  'service',
  'privacy',
  'location',
  'supplier',
  'marketing',
  'age14',
  'interest_alert',
] as const;
export type TermsType = (typeof TERMS_TYPES)[number];

/**
 * 로그인한 사람 (auth.users와 1:1). 처음 로그인할 때 로그인 콜백이 만든다.
 * 고객·원장님 계정이 모두 탈퇴하고 30일이 지나면 로그인 정보(auth.users)를 지우고 이 줄은 기록 보관용으로 남긴다(#154 (가), 11/23 nnoinn).
 * 그래서 auth.users를 FK로 가리키지 않는다(0023에서 끊었다). 같은 간편 로그인으로 다시 오면 새 로그인 정보·새 줄로 시작한다
 */
export const profiles = pgTable(
  'profiles',
  {
    // auth.users.id와 같은 값
    id: uuid().primaryKey(),
    // 로그인 이메일. 두 계정이 모두 탈퇴하고 30일이 지나면 지운다(빈 값, #154)
    email: text(),
    // 관리자 여부. nnoinn이 DB에서 직접 바꾼다
    isAdmin: boolean().notNull().default(false),
    // 같은 사람 표시(#154): 로그인 이메일의 HMAC-SHA256(키는 서버 환경변수 ACCOUNT_IDENTITY_KEY). 이메일을 지운 뒤에도 5년 남긴다.
    // 신규 고객 판별(#49)이 탈퇴·재가입한 같은 사람의 예전 이력을 찾을 때 쓴다. 다시 가입한 사람은 새 줄에 같은 값이 들어가서 unique가 아니다
    identityHash: text(),
    createdAt: createdAt(),
  },
  (t) => [index('profiles_identity_hash_idx').on(t.identityHash)],
).enableRLS();

/**
 * 고객 계정. 한 로그인에 탈퇴하지 않은 고객 계정은 하나다(withdrawn_at이 빈 줄 하나, #154).
 * 탈퇴하고 30일이 지나면 같은 로그인으로 새 계정을 만들 수 있어서, 탈퇴한 줄은 여러 개일 수 있다
 */
export const customers = pgTable(
  'customers',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => profiles.id),
    // 예약자 이름(#375, 11/13 nnoinn). 가입 화면에서 받고 내 정보에서 고친다(앞뒤 공백 빼고 1~30자, 계정 확인 함수에서 검사).
    // 예약한 샵에는 이름과 휴대폰 번호만 주고 닉네임은 주지 않는다. 0015 전에 있던 계정은 닉네임으로 채웠다
    name: text().notNull(),
    // 투리 안에서만 쓰는 이름(내 정보, 운영자 회원 목록 둘째 칸)
    nickname: text().notNull(),
    // 예약 확인·노쇼 연락용. 인증 없이 형식만 검사하고, 예약 전에 꼭 입력받는다
    phone: text(),
    // 관심 지역 알림을 마지막으로 보낸 시각(하루 1번 13시 묶음 발송 기준)
    lastInterestPushAt: timestamptz(),
    // 탈퇴한 시각(#154). 자세한 기록(되살리기·30일 뒤 지우기)은 account_withdrawals
    withdrawnAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('customers_user_id_active_unique')
      .on(t.userId)
      .where(sql`${t.withdrawnAt} is null`),
    index('customers_user_id_idx').on(t.userId),
  ],
).enableRLS();

/**
 * 원장님 계정. 가입(S-101) 때 shops·payout_accounts와 한 트랜잭션으로 만든다.
 * 고객 계정처럼 한 로그인에 탈퇴하지 않은 원장님 계정은 하나다(#154)
 */
export const owners = pgTable(
  'owners',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => profiles.id),
    // 탈퇴하고 30일이 지나면 "탈퇴한 회원"으로 바꾼다(#154)
    name: text().notNull(),
    // 탈퇴하고 30일이 지나면 지운다(빈 값, #154). 탈퇴하지 않은 계정은 꼭 있다
    phone: text(),
    // 탈퇴한 시각(#154). 자세한 기록은 account_withdrawals
    withdrawnAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('owners_user_id_active_unique')
      .on(t.userId)
      .where(sql`${t.withdrawnAt} is null`),
    index('owners_user_id_idx').on(t.userId),
    check('owners_phone_check', sql`${t.phone} is not null or ${t.withdrawnAt} is not null`),
  ],
).enableRLS();

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
