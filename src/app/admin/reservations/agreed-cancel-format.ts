// 운영자 예약 상세 '합의 후 취소 요청' 칸의 표시 모양(X-208). 화면 코드에서만 쓴다.
// 상태는 저장된 값이 아니라 지금 상태(currentRequestStatus: 답 기한이 지났으면 만료, 그사이 예약이 바뀌었으면 끝남)다.
// 원장님·손님 화면과 같은 규칙이라, 정리 작업이 상태를 바꾸기 전이라도 같은 상태로 보인다

import type { ReservationStatus, VisitResult } from '@/db/schema/payments';
import type { AgreedCancelRequestStatus } from '@/db/schema/refunds';
import { formatKstDateTime } from '@/lib/time';
import { currentRequestStatus } from '@/server/refunds/agreed-cancel-rules';

import type { ReservationAgreedCancelRow } from './agreed-cancel-queries';

/** 화면에 보여 줄 요청 한 건 */
export type AgreedCancelView = {
  requestId: string;
  /** 지금 상태 */
  status: AgreedCancelRequestStatus;
  reason: ReservationAgreedCancelRow['reason'];
  reasonText: string | null;
  requestedAt: Date;
  /** 상태에 맞는 시각 한 줄. 보여 줄 시각이 없으면 null */
  timeText: string | null;
};

/**
 * 상태에 맞는 시각 한 줄.
 * - 답을 기다림: 손님이 답할 수 있는 마지막 시각
 * - 동의·거절: 손님이 답한 시각
 * - 만료: 답 기한(정리 작업이 기록하기 전이라도 기한으로 보여 준다)
 * - 끝남(답하기 전에 예약이 취소·방문 처리됨): 정리 작업이 기록한 시각. 아직 기록하기 전이면 없음
 */
export function agreedCancelTimeText(
  status: AgreedCancelRequestStatus,
  request: { expiresAt: Date; respondedAt: Date | null },
): string | null {
  switch (status) {
    case 'requested':
      return `${formatKstDateTime(request.expiresAt)}까지 손님이 답할 수 있어요`;
    case 'agreed':
    case 'declined':
      return request.respondedAt ? `${formatKstDateTime(request.respondedAt)} 손님이 답함` : null;
    case 'expired':
      return `${formatKstDateTime(request.expiresAt)}까지 답이 없었어요`;
    case 'closed':
      return request.respondedAt ? `${formatKstDateTime(request.respondedAt)} 끝남` : null;
  }
}

/** 요청들을 지금 상태로 바꿔 화면에 보여 줄 모양으로. 순서는 받은 그대로(최근 요청부터) */
export function agreedCancelViews(
  requests: readonly ReservationAgreedCancelRow[],
  reservation: { status: ReservationStatus; visitResult: VisitResult | null },
  now: Date,
): AgreedCancelView[] {
  return requests.map((request) => {
    const status = currentRequestStatus(request, reservation, now);
    return {
      requestId: request.requestId,
      status,
      reason: request.reason,
      reasonText: request.reasonText,
      requestedAt: request.requestedAt,
      timeText: agreedCancelTimeText(status, request),
    };
  });
}
