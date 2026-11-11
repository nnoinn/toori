'use server';

// 원장님 예약 상세의 방문 완료·노쇼 처리 (O14, S-405·S-406, 연결 #11·#130)와 합의 후 취소 요청 (S-410, 연결 #19, #301).
// 저장은 강규민 recordVisit·requestAgreedCancel이 한다(내 샵 예약인지, 지금 할 수 있는지를 서버가 다시 본다).
// 여기서는 처리한 뒤 화면을 새로 고친다.

import { refresh } from 'next/cache';

import type { Result } from '@/lib/result';
import { requestAgreedCancel } from '@/server/refunds/agreed-cancel';
import type { RequestedAgreedCancel } from '@/server/refunds/agreed-cancel-types';
import { recordVisit } from '@/server/visits/record-visit';
import type { RecordedVisit, VisitResult } from '@/server/visits/types';

import { agreedCancelFailShowsNewState } from './cancel-request';
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

/** 손님과 합의 후 취소를 요청한다(S-410). 손님이 24시간 안에 앱에서 동의해야 취소된다 */
export async function requestReservationAgreedCancel(input: {
  reservationId: string;
  reason: string;
  reasonText: string | null;
}): Promise<Result<RequestedAgreedCancel>> {
  const requested = await requestAgreedCancel(input);
  // 요청했거나, 그 사이 다른 요청이 생겼거나 예약이 바뀌었으면 화면을 지금 상태(요청 상태 카드)로 다시 받는다
  if (requested.ok || agreedCancelFailShowsNewState(requested.error.code)) refresh();
  return requested;
}
