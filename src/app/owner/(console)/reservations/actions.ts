'use server';

// 원장님 예약 상세의 방문 완료·노쇼 처리 (O14, S-405·S-406, 연결 #11·#130).
// 저장은 강규민 recordVisit이 한다(내 샵 예약인지, 시작 시각이 지났는지, 이미 처리했는지를 서버가 다시 본다).
// 여기서는 처리한 뒤 화면을 새로 고친다.

import { refresh } from 'next/cache';

import type { Result } from '@/lib/result';
import { recordVisit } from '@/server/visits/record-visit';
import type { RecordedVisit, VisitResult } from '@/server/visits/types';

import { visitFailShowsNewState } from './reservation-detail';

/** 예약을 방문 완료(visited)·노쇼(no_show)로 처리한다. 처리한 뒤에는 원장님이 바꿀 수 없다 */
export async function recordReservationVisit(
  reservationId: string,
  result: VisitResult,
): Promise<Result<RecordedVisit>> {
  const recorded = await recordVisit({ reservationId, result });
  // 처리했거나, 그 사이 다른 곳에서 처리·취소됐으면 화면을 지금 상태로 다시 받는다
  if (recorded.ok || visitFailShowsNewState(recorded.error.code)) refresh();
  return recorded;
}
