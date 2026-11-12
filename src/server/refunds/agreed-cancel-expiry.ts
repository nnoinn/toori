// 합의 후 취소 요청 정리 (X-208, #320). 5분마다 도는 리마인드 예약 작업(/api/cron/reminders)이 같이 부른다. 서버에서만 부른다.
// - 만료 시각이 지난 '답 기다림' 요청을 '만료'로 바꾸고 원장님에게 "합의 후 취소 요청이 만료됐어요"를 보낸다(예약은 그대로)
// - 손님이 답하기 전에 예약이 바뀐(취소, 방문·노쇼 처리) 요청을 '끝남'으로 바꾼다(알림 없음)
// 화면 함수는 이 작업이 돌기 전이라도 expires_at으로 만료를 판단하므로, 이 작업은 기록 정리와 원장님 알림을 맡는다

import 'server-only';

import type { getDb } from '@/db';
import { sendAgreedCancelResult } from '@/server/notifications/alerts';

import { closeChangedRequests, expireDueRequests } from './agreed-cancel-store';

type Db = ReturnType<typeof getDb>;

/** 한 번에 만료로 바꾸는 요청 수. 남은 것은 다음 실행(5분 뒤)이 바꾼다 */
const EXPIRE_BATCH = 200;

export type AgreedCancelSweepSummary = { expired: number; closed: number; failed: number };

export async function sweepAgreedCancelRequests(
  db: Db,
  now: Date,
): Promise<AgreedCancelSweepSummary> {
  const expired = await expireDueRequests(db, { now, limit: EXPIRE_BATCH });
  let failed = 0;
  for (const item of expired) {
    try {
      await sendAgreedCancelResult(db, { ...item, result: 'expired' });
    } catch (error) {
      failed += 1;
      console.error(
        '[agreed-cancel] 만료 알림 실패:',
        item.requestId,
        error instanceof Error ? error.name : 'unknown',
      );
    }
  }
  const closed = await closeChangedRequests(db, { now });
  return { expired: expired.length, closed, failed };
}
