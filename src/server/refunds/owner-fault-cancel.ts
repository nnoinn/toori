'use server';

// 원장님 귀책 취소 (S-409, X-207, 연결 #18, #419). 원장님 예약 상세의 [예약 취소] → "원장님 사정으로 취소"(정민석 S-409)에서 부른다.
// 화면에서는 '@/server/refunds/owner-fault-cancel'에서 가져온다. 금액은 화면에서 계산하지 않고 previewOwnerFaultCancel 값을 보여준다.
//
// - previewOwnerFaultCancel: 읽기만 한다. 예정 예약이고 서비스 시작 전이면 취소할 수 있다(시작 뒤 문제는 손님이 이의제기, A-104)
// - cancelByOwnerFault: 고객 취소와 같은 순서(cancel-flow.ts)로 진행 중 저장 → 포트원 전액 환불 → 한 트랜잭션에서 예약·매물 '취소',
//   환불 기록 끝, 쓴 쿠폰 돌려주기, 보상 쿠폰 3,000원(90일), 패널티 5,000원, 답을 기다리는 합의 후 취소 요청 닫기(owner-fault-store.ts).
//   손님에게 알림이 가고 원장님 재등록 안내는 보내지 않는다(11/15 nnoinn). 중간에 멈추면 정리 작업(sweep-cancels.ts)이 마무리한다
// 모두 원장님 계정(requireOwner)이고 내 샵 예약만이다. 남의 샵 예약은 있는지조차 알리지 않고 RESERVATION_NOT_FOUND다

import { z } from 'zod';

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { ok } from '@/lib/result';
import { requireOwner } from '@/server/auth';
import { OWNER_FAULT_COUPON_AMOUNT, OWNER_FAULT_PENALTY_AMOUNT } from '@/server/policy/owner-fault';

import { calcRefund } from './calc-refund';
import { runCancelRefund } from './cancel-flow';
import { refundFail, type RefundResult } from './errors';
import { OWNER_FAULT_CANCEL_REASON } from './refund-payment';
import { readRefundTargetForShop, type RefundTarget } from './refund-store';
import type { CancelledReservation, OwnerFaultCancelPreview } from './types';

const reservationIdSchema = z.uuid();

/** 지금 원장님 귀책 취소를 막는 이유. 취소할 수 있으면 null */
function blockReason(target: RefundTarget, now: Date) {
  if (target.status === 'cancelled') return 'ALREADY_CANCELLED' as const;
  // 방문·노쇼 처리됐거나 서비스가 시작됐다
  if (target.status === 'completed' || now.getTime() >= target.startAt.getTime()) {
    return 'ALREADY_STARTED' as const;
  }
  return null;
}

/** 내 샵 예약을 읽는다. 없거나 남의 샵 예약이면 null */
async function readMyTarget(reservationId: unknown) {
  const auth = await requireOwner();
  if (!auth.ok) return { auth, target: null };
  const id = reservationIdSchema.safeParse(reservationId);
  if (!id.success) return { auth, target: null };
  return { auth, target: await readRefundTargetForShop(id.data, auth.data.shopId) };
}

/** 확인 창을 열 때. 이미 취소된 예약이면 ALREADY_CANCELLED, 시작 뒤면 cancellable: false */
export async function previewOwnerFaultCancel(
  reservationId: string,
): Promise<RefundResult<OwnerFaultCancelPreview>> {
  const { auth, target } = await readMyTarget(reservationId);
  if (!auth.ok) return auth;
  if (!target) return refundFail('RESERVATION_NOT_FOUND');
  if (target.status === 'cancelled') return refundFail('ALREADY_CANCELLED');
  const now = await getRequestNow();
  const calc = calcRefund({
    paidAmount: target.paidAmount,
    salePrice: target.salePrice,
    startAt: target.startAt,
    now,
    reason: 'owner_fault',
  });
  return ok({
    reservationId: target.reservationId,
    cancellable: blockReason(target, now) === null,
    paidAmount: target.paidAmount,
    refundAmount: calc.refundAmount,
    usedCouponAmount: target.couponAmount,
    compensationCouponAmount: OWNER_FAULT_COUPON_AMOUNT,
    penaltyAmount: OWNER_FAULT_PENALTY_AMOUNT,
    startAt: target.startAt.toISOString(),
    serverNow: now.toISOString(),
  });
}

/**
 * [원장님 사정으로 취소] 확인. 결제액 전부를 돌려준다. 다른 취소(고객 취소·합의 후 취소)가 진행 중이면 CANCEL_FINISHING,
 * 결과를 기다리면 CANCEL_FINISHING(정리 작업이 끝낸다), 돌려준 돈이 없으면 REFUND_FAILED(예약은 그대로)
 */
export async function cancelByOwnerFault(input: {
  reservationId: string;
}): Promise<RefundResult<CancelledReservation>> {
  const { auth, target } = await readMyTarget(input?.reservationId);
  if (!auth.ok) return auth;
  if (!target) return refundFail('RESERVATION_NOT_FOUND');
  const now = await getRequestNow();
  // 진행 중인 원장님 귀책 취소를 다시 누른 것이면 저장해 둔 값으로 이어서 한다(그 사이 시작 시각이 지나도 돈은 이미 돌아가는 중이다)
  const resuming = target.requested?.reason === 'owner_fault' && target.status === 'confirmed';
  if (!resuming) {
    const blocked = blockReason(target, now);
    if (blocked) return refundFail(blocked);
  }
  if (target.requested && target.requested.reason !== 'owner_fault') {
    return refundFail('CANCEL_FINISHING');
  }

  const calc = calcRefund({
    paidAmount: target.paidAmount,
    salePrice: target.salePrice,
    startAt: target.startAt,
    now,
    reason: 'owner_fault',
  });
  const requested = target.requested ?? {
    reason: 'owner_fault' as const,
    band: null,
    penaltyRate: calc.penaltyRate,
    refundAmount: calc.refundAmount,
    penaltyAmount: calc.penaltyAmount,
    requestedAt: now,
  };
  return runCancelRefund(getDb(), {
    target,
    requested,
    now,
    pgReason: OWNER_FAULT_CANCEL_REASON,
  });
}
