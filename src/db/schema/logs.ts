// 기록 테이블 (docs/schema-v1.md 4장 location_use_logs, cron_runs).
// 위치정보법: 위치정보 이용 사실 확인자료를 자동으로 기록하고 6개월 이상 보관한다. 좌표는 저장하지 않는다.

import { sql } from 'drizzle-orm';
import { boolean, check, index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { profiles } from './accounts';
import { createdAt, inValues, timestamptz } from './types';

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

/** 예약 작업(src/db/cron/*.sql, 주소 src/app/api/cron/*): 결제 정리 / 리마인드 / 정산 묶기 / 새 매물 알림 */
export const CRON_JOBS = [
  'payments-sweep',
  'reminders',
  'settlement-batch',
  'slot-digest',
] as const;
export type CronJob = (typeof CRON_JOBS)[number];

/**
 * 예약 작업 실행 기록 (#373 ⑥, #433). 작업 주소가 시작할 때 한 줄을 넣고 끝날 때 결과를 채운다.
 * 끝난 시각이 비어 있으면 도는 중이거나 중간에 멈춘 것이다. 운영자 화면이 마지막 성공·연속 실패를 보고 경고한다.
 * 30일이 지난 기록은 각 작업이 끝날 때 자기 기록을 지운다(리마인드가 5분마다라 하루 288줄)
 */
export const cronRuns = pgTable(
  'cron_runs',
  {
    id: uuid().primaryKey().defaultRandom(),
    job: text().notNull(),
    startedAt: timestamptz().notNull(),
    finishedAt: timestamptz(),
    // 성공 여부. 끝난 시각과 같이 채운다
    ok: boolean(),
    // 처리 개수(예: {"checked":3,"confirmed":1})
    summary: jsonb(),
    // 실패 이유: 오류 이름과 메시지만(값이 들어가는 detail은 남기지 않는다)
    error: text(),
  },
  (t) => [
    check('cron_runs_job_check', inValues(t.job, CRON_JOBS)),
    check('cron_runs_finished_check', sql`(${t.finishedAt} is null) = (${t.ok} is null)`),
    // 작업마다 최근 실행 보기, 30일 지난 기록 지우기
    index('cron_runs_job_started_at_idx').on(t.job, t.startedAt.desc()),
  ],
).enableRLS();
