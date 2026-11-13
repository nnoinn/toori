// [내 예약] 카드의 "합의 후 취소 요청" 뱃지(#359 3번, C-506). 화면 없이 테스트한다.
// 예약 상세의 요청 카드(getAgreedCancelRequest)와 같은 기준이다: 그 예약의 가장 최근 요청이 지금도 답을 기다리는 중
// (거절·동의·만료가 아니고, 24시간 답 기한 전이고, 예약이 아직 예정이고 방문·노쇼 처리 전). 판단은 강규민님 규칙 함수를 그대로 쓴다

import type { ReservationStatus, VisitResult } from '@/db/schema/payments';
import type { AgreedCancelRequestStatus } from '@/db/schema/refunds';
import { currentRequestStatus } from '@/server/refunds/agreed-cancel-rules';

export function hasPendingAgreedCancel(
  /** 그 예약의 가장 최근 요청. 없으면 null */
  latest: { status: AgreedCancelRequestStatus; expiresAt: Date } | null,
  reservation: { status: ReservationStatus; visitResult: VisitResult | null },
  now: Date,
): boolean {
  return latest !== null && currentRequestStatus(latest, reservation, now) === 'requested';
}
