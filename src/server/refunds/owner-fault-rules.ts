// 원장님 귀책 취소(S-409, X-207, #419)의 판단. 서버에서만 부른다.
// 원장님이 직접 하는 취소(owner-fault-cancel.ts)와 운영자가 대신 하는 취소(admin-owner-fault-cancel.ts, #373 ③-2)가 같이 써서
// 막는 조건·금액·이어서 하기가 늘 같다(결과와 금액은 원장님이 직접 한 것과 같다, #373 ③)

import 'server-only';

import { OWNER_FAULT_COUPON_AMOUNT, OWNER_FAULT_PENALTY_AMOUNT } from '@/server/policy/owner-fault';

import { calcRefund } from './calc-refund';
import type { RefundErrorCode } from './errors';
import type { RefundTarget, RequestedCancel } from './refund-store';
import type { OwnerFaultCancelPreview } from './types';

/** 지금 원장님 귀책 취소를 막는 이유. 취소할 수 있으면 null */
export function ownerFaultBlock(
  target: RefundTarget,
  now: Date,
): Extract<RefundErrorCode, 'ALREADY_CANCELLED' | 'ALREADY_STARTED'> | null {
  if (target.status === 'cancelled') return 'ALREADY_CANCELLED';
  // 방문·노쇼 처리됐거나 서비스가 시작됐다
  if (target.status === 'completed' || now.getTime() >= target.startAt.getTime()) {
    return 'ALREADY_STARTED';
  }
  return null;
}

function calcOwnerFault(target: RefundTarget, now: Date) {
  return calcRefund({
    paidAmount: target.paidAmount,
    salePrice: target.salePrice,
    startAt: target.startAt,
    now,
    reason: 'owner_fault',
  });
}

/** 확인 창에 보여 줄 금액. 취소된 예약은 부른 쪽이 먼저 ALREADY_CANCELLED로 막는다 */
export function ownerFaultPreview(target: RefundTarget, now: Date): OwnerFaultCancelPreview {
  return {
    reservationId: target.reservationId,
    cancellable: ownerFaultBlock(target, now) === null,
    paidAmount: target.paidAmount,
    refundAmount: calcOwnerFault(target, now).refundAmount,
    usedCouponAmount: target.couponAmount,
    compensationCouponAmount: OWNER_FAULT_COUPON_AMOUNT,
    penaltyAmount: OWNER_FAULT_PENALTY_AMOUNT,
    startAt: target.startAt.toISOString(),
    serverNow: now.toISOString(),
  };
}

/**
 * 환불 진행(cancel-flow.ts)에 넘길 원장님 귀책 취소 요청. 막히면 그 코드.
 * - 진행 중인 원장님 귀책 취소를 다시 누른 것이면 저장해 둔 값으로 이어서 한다(그 사이 시작 시각이 지나도 돈은 이미 돌아가는 중이다)
 * - 다른 취소(고객 취소·합의 후 취소)나 예약 무효(A-108)가 진행 중이면 CANCEL_FINISHING(그쪽이 끝낸다. 진행 중 환불은 예약당 하나, VOID-05)
 */
export function ownerFaultRequest(
  target: RefundTarget,
  now: Date,
):
  | { ok: true; requested: RequestedCancel }
  | {
      ok: false;
      code: Extract<RefundErrorCode, 'ALREADY_CANCELLED' | 'ALREADY_STARTED' | 'CANCEL_FINISHING'>;
    } {
  const resuming = target.requested?.reason === 'owner_fault' && target.status === 'confirmed';
  if (!resuming) {
    const blocked = ownerFaultBlock(target, now);
    if (blocked) return { ok: false, code: blocked };
  }
  if ((target.requested && target.requested.reason !== 'owner_fault') || target.voidInProgress) {
    return { ok: false, code: 'CANCEL_FINISHING' };
  }
  const calc = calcOwnerFault(target, now);
  return {
    ok: true,
    requested: target.requested ?? {
      reason: 'owner_fault',
      band: null,
      penaltyRate: calc.penaltyRate,
      refundAmount: calc.refundAmount,
      penaltyAmount: calc.penaltyAmount,
      requestedAt: now,
    },
  };
}
