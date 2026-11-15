// 운영자 테이블 (docs/schema-v1.md 8장, A-104, A-101~A-105).

import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';

import { profiles } from './accounts';
import { reservations } from './payments';
import { createdAt, inValues, timestamptz, updatedAt } from './types';

/** 이의제기 종류: 노쇼 이의 / 환불 예외 / 시작 후 문제 */
export const DISPUTE_TYPES = ['no_show', 'refund_exception', 'after_start'] as const;
export type DisputeType = (typeof DISPUTE_TYPES)[number];

/** 이의제기 상태 */
export const DISPUTE_STATUSES = ['open', 'resolved'] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

/** 이의제기 접수 경로: 고객이 앱에서 접수 / 카카오톡 채널로 받아 운영자가 등록 (#350) */
export const DISPUTE_CHANNELS = ['app', 'kakao'] as const;
export type DisputeChannel = (typeof DISPUTE_CHANNELS)[number];

/**
 * 이의제기 결론 종류 (#350, 11/12 승인). 노쇼 확정 / 노쇼 취소(방문으로 바꿈) / 환불 예외 / 무효(A-108) /
 * 원장님 귀책 취소로 바꿈(X-207) / 바꿀 것 없음. 돈이 오가는 셋(환불 예외·무효·원장님 귀책 취소)은
 * 처리 기능이 생길 때까지 서버가 고르지 못하게 막는다. DB 목록에는 미리 넣어 두고 마이그레이션 없이 하나씩 연다
 */
export const DISPUTE_OUTCOMES = [
  'no_show_confirmed',
  'no_show_reversed',
  'refund_exception',
  'voided',
  'owner_fault_cancel',
  'no_change',
] as const;
export type DisputeOutcome = (typeof DISPUTE_OUTCOMES)[number];

/** 이의제기 (A-104) */
export const disputes = pgTable(
  'disputes',
  {
    id: uuid().primaryKey().defaultRandom(),
    reservationId: uuid()
      .notNull()
      .references(() => reservations.id),
    type: text().notNull(),
    content: text().notNull(),
    status: text().notNull(),
    // 접수 경로(app / kakao)
    channel: text().notNull(),
    // 접수 시각. 앱은 접수한 순간, 카카오톡 채널은 채널에서 받은 시각(운영자가 입력). 접수 기한은 이 시각으로 본다
    receivedAt: timestamptz().notNull(),
    // 카카오톡 채널 건을 등록한 운영자. 앱 접수는 비어 있다
    registeredBy: uuid().references(() => profiles.id),
    // 결론 종류. 확인 중(open)이면 비어 있고, 결론이 나면(resolved) 꼭 있다
    outcome: text(),
    // 결론 메모
    result: text(),
    // 결론을 기록한 운영자와 시각
    handledBy: uuid().references(() => profiles.id),
    handledAt: timestamptz(),
    createdAt: createdAt(),
  },
  (t) => [
    check('disputes_type_check', inValues(t.type, DISPUTE_TYPES)),
    check('disputes_status_check', inValues(t.status, DISPUTE_STATUSES)),
    check('disputes_channel_check', inValues(t.channel, DISPUTE_CHANNELS)),
    // 카카오톡 채널 건이면 등록한 운영자가 꼭 있고, 앱 접수면 비어 있다(양쪽, #350 리뷰)
    check(
      'disputes_registered_by_check',
      sql`(${t.channel} = 'kakao') = (${t.registeredBy} is not null)`,
    ),
    check(
      'disputes_outcome_check',
      sql`${t.outcome} is null or ${inValues(t.outcome, DISPUTE_OUTCOMES)}`,
    ),
    // 결론(resolved)이면 결론 종류가 꼭 있고, 확인 중(open)이면 비어 있다
    check(
      'disputes_outcome_status_check',
      sql`(${t.status} = 'resolved') = (${t.outcome} is not null)`,
    ),
    // 한 예약에 이의제기 하나. 앱으로 접수한 예약에 카카오톡 채널로 이어서 연락이 오면 그 기록에서 처리한다
    unique('disputes_reservation_id_unique').on(t.reservationId),
  ],
).enableRLS();

/**
 * 운영자 작업 기록. 누가, 언제, 무엇을 했는지 남긴다.
 * action·target_type은 종류가 계속 늘어나서 check를 두지 않는다(#64).
 * 예: shop.approve, shop.reject, visit.override, refund.exception, settlement.payout_request
 * 운영자가 데이터를 바꾸면 같은 트랜잭션에서 남기고 사유는 memo에 적는다. 앱에서 고치거나 지울 수 없다(0016 트리거, #372 5장)
 */
export const adminActions = pgTable('admin_actions', {
  id: uuid().primaryKey().defaultRandom(),
  adminId: uuid()
    .notNull()
    .references(() => profiles.id),
  action: text().notNull(),
  // 예: shop, reservation, settlement
  targetType: text().notNull(),
  targetId: uuid().notNull(),
  memo: text(),
  createdAt: createdAt(),
}).enableRLS();

/**
 * 운영자 프로필 (#372 4장, 11/13 nnoinn). 운영자 화면 위 이름과 운영자 기록 화면에 보일 이름이다.
 * 권한을 켜고 끄는 것은 profiles.is_admin이고, 여기는 이름·맡은 일만 둔다(맡은 일로 권한 차이를 두지 않는다).
 * 지우지 않는다. 그만둔 운영자도 기록 화면에 이름이 보여야 해서다. 새 운영자는 당분간 강규민이 SQL로 is_admin과 같이 넣는다
 */
export const adminProfiles = pgTable('admin_profiles', {
  userId: uuid()
    .primaryKey()
    .references(() => profiles.id),
  // 화면과 기록에 보일 이름(필수)
  name: text().notNull(),
  // 맡은 일(선택, 예: 정산, 고객 응대)
  role: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();

/**
 * 운영자 열람 기록 (#269, 11/8 결정). 운영자가 개인정보가 보이는 화면을 볼 때마다 한 줄 남긴다
 * (개인정보 안전성 확보조치 기준의 접속 기록). 1년 이상 보관하고 앱에서 고치거나 지우지 않는다.
 * 작업 기록(admin_actions)과 달리 목록·검색처럼 대상이 없는 열람과 접속 IP·검색어도 남긴다
 */
export const adminAccessLogs = pgTable(
  'admin_access_logs',
  {
    id: uuid().primaryKey().defaultRandom(),
    adminId: uuid()
      .notNull()
      .references(() => profiles.id),
    // 예: view(상세 보기), search(목록·검색). 종류가 늘 수 있어서 check를 두지 않는다(admin_actions와 같다)
    action: text().notNull(),
    // 예: customer, owner, shop, reservation. 목록·검색이면 list
    targetType: text().notNull(),
    // 상세면 대상 id, 목록·검색이면 비어 있다
    targetId: uuid(),
    // 본 화면 주소(검색어는 query에 따로 둔다)
    path: text().notNull(),
    // 목록·검색에서 쓴 검색어. 번호로 찾을 수도 있어서 개인정보로 다룬다
    query: text(),
    // 접속 IP(x-forwarded-for 첫 값). 모양이 이상해도 기록이 실패하지 않게 글자로 둔다
    ip: text(),
    createdAt: createdAt(),
  },
  (t) => [
    // 보관 기간이 지난 기록 찾기
    index('admin_access_logs_created_at_idx').on(t.createdAt),
    // 월 1회 이상 접근 점검(운영자별)
    index('admin_access_logs_admin_created_at_idx').on(t.adminId, t.createdAt),
  ],
).enableRLS();
