// 예약 작업 상태(#373 ⑥, #433, 11/16) 정책 값. 화면과 서버가 같이 쓴다.

import type { CronJob } from '@/db/schema/logs';

/**
 * 마지막 성공이 이보다 오래되면 운영자 화면에 경고한다(분). 주기의 서너 배쯤이고, 하루 한 번 도는 작업은 26시간이다.
 * 작업이 아예 불리지 않은 경우(등록 빠뜨림, 주소 오류)도 여기서 잡힌다
 */
export const CRON_STALE_MINUTES: Record<CronJob, number> = {
  'payments-sweep': 30,
  reminders: 15,
  'settlement-batch': 26 * 60,
  'slot-digest': 26 * 60,
};

/** 이만큼 이어서 실패하면 경고한다 */
export const CRON_FAILURE_ALERT_COUNT = 3;

/** 시작하고 이만큼 지나도 끝나지 않은 실행은 중간에 멈춘 것(실패)으로 본다(분). 작업 주소는 최대 60초까지 돈다 */
export const CRON_RUN_TIMEOUT_MINUTES = 10;

/** 실행 기록 보관 일수. 각 작업이 끝날 때 자기 기록 중 이보다 오래된 것을 지운다 */
export const CRON_RUN_KEEP_DAYS = 30;
