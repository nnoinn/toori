// 운영자 예약 상세의 "방문·노쇼" 칸에 무엇을 보여줄지 (#373 ③, 11/16). 화면 코드에서만 쓴다.
// 대신 처리할 수 있는지는 원장님 버튼과 같은 규칙(visitBlockReason)이고, 노쇼 되돌리기를 막는 이유는 서버와 같다.

import type { ReservationStatus, VisitResult } from '@/db/schema';
import { visitBlockReason } from '@/server/visits/rules';

export type VisitPanel =
  /** 취소된 예약: 처리하지 않는다 */
  | { kind: 'cancelled' }
  /** 서비스 시작 전: 시작 시각부터 처리할 수 있다 */
  | { kind: 'before_start'; startAt: Date }
  /** 시작했고 처리 전: [방문 완료]·[노쇼] */
  | { kind: 'can_record' }
  /** 방문 완료로 처리됨 */
  | { kind: 'visited'; recordedAt: Date | null }
  /** 노쇼로 처리됨: 막는 이유가 없으면 [방문으로 바꾸기] */
  | {
      kind: 'no_show';
      recordedAt: Date | null;
      reverseBlock: 'DISPUTE_OPEN' | 'SETTLEMENT_BUNDLED' | null;
    };

export function visitPanel(
  reservation: {
    status: ReservationStatus;
    visitResult: VisitResult | null;
    visitRecordedAt: Date | null;
    startAt: Date;
    /** 확인 중인 이의제기가 있다 */
    disputeOpen: boolean;
    /** 정산에 묶였다 */
    settlementBundled: boolean;
  },
  now: Date,
): VisitPanel {
  if (reservation.visitResult === 'visited') {
    return { kind: 'visited', recordedAt: reservation.visitRecordedAt };
  }
  if (reservation.visitResult === 'no_show') {
    return {
      kind: 'no_show',
      recordedAt: reservation.visitRecordedAt,
      reverseBlock: reservation.disputeOpen
        ? 'DISPUTE_OPEN'
        : reservation.settlementBundled
          ? 'SETTLEMENT_BUNDLED'
          : null,
    };
  }
  const blocked = visitBlockReason(reservation, now);
  if (blocked === 'TOO_EARLY') return { kind: 'before_start', startAt: reservation.startAt };
  if (blocked === null) return { kind: 'can_record' };
  // 취소됐거나, 방문 결과 없이 이용 완료로 남은 예전 예약
  return { kind: 'cancelled' };
}
