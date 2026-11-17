// 예약 상세의 정산 보류 칸(#373 ②): 지금 보류를 걸 수 없으면 그 이유. 계산만 한다.
// 서버(hold-store.ts holdReservationInTx)가 막는 조건과 같은 정산 규칙(settlementKindOf)을 쓴다. 버튼을 숨기는 데만 쓰고, 막는 것은 서버가 한다

import type { CancelActor, ReservationStatus, VisitResult } from '@/db/schema/payments';
import type { SettlementHoldErrorCode } from '@/server/settlements/hold-errors';
import { settlementKindOf } from '@/server/settlements/settle-rules';

export type ReservationHoldInput = {
  status: ReservationStatus;
  visitResult: VisitResult | null;
  visitRecordedAt: Date | null;
  cancelledAt: Date | null;
  cancelActor: string | null;
  /** 예약 무효 시각(A-108). 무효 예약은 정산 줄이 없다 */
  voidedAt: Date | null;
  startAt: Date;
  refunds: readonly { reason: string; status: string; penaltyRate: number }[];
  settlementBundled: boolean;
};

/** 보류를 걸 수 없는 이유. 걸 수 있으면 null(예정 예약은 걸 수 있다: 끝나도 묶이지 않는다) */
export function reservationHoldBlock(
  input: ReservationHoldInput,
): Extract<SettlementHoldErrorCode, 'ALREADY_BUNDLED' | 'NOTHING_TO_SETTLE'> | null {
  if (input.settlementBundled) return 'ALREADY_BUNDLED';
  if (input.status === 'confirmed') return null;
  // 끝난 고객 취소·합의 후 취소 환불(한 예약에 하나)의 위약금 비율. 정산 묶기의 cancelRefundJoin과 같다
  const cancelRefund = input.refunds.find(
    (refund) =>
      (refund.reason === 'customer_cancel' || refund.reason === 'agreed_cancel') &&
      refund.status === 'done',
  );
  const kind = settlementKindOf({
    status: input.status,
    visitResult: input.visitResult,
    visitRecordedAt: input.visitRecordedAt,
    cancelledAt: input.cancelledAt,
    cancelActor: input.cancelActor as CancelActor | null,
    startAt: input.startAt,
    cancelPenaltyRate: cancelRefund?.penaltyRate ?? null,
    hasAdminRefund: input.refunds.some((refund) => refund.reason === 'admin_exception'),
    voidedAt: input.voidedAt,
  });
  return kind ? null : 'NOTHING_TO_SETTLE';
}
