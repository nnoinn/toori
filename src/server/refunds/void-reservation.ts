'use server';

// 예약 무효(A-108, #423, 11/8·11/15 nnoinn). 운영자 화면(예약 상세 [예약 무효], 이의제기 결론 "무효")에서 부른다. 모두 운영자만(requireAdmin).
// 원장님이 손님에게 전액 환불을 요청했을 때만 쓴다. 원장님이 요청한 내용은 필수이고 운영자 처리 기록(reservation.void)의 메모로 남는다.
// 손님에게 실제 결제액 중 아직 돌려주지 않은 금액 전부와 쓴 쿠폰을 돌려주고, 원장님 정산 기준 금액은 0, 패널티는 없다.
// 예정·취소·완료(노쇼 포함) 예약 모두 되지만 정산에 묶인 예약은 막는다(SETTLEMENT_BUNDLED).
// 처리 순서는 고객 취소와 같다: 진행 중 기록(운영자 처리 기록과 같이) → 포트원 환불 → 한 트랜잭션에서 끝 → 손님·원장님 알림.
// 돌려줄 돈이 없으면(이미 다 돌려줬거나 쿠폰으로 0원 결제) 포트원을 부르지 않고 한 트랜잭션에서 바로 끝낸다.
// 중간에 멈추면 정리 작업(payments-sweep)이 포트원 취소 내역을 보고 끝낸다. 다시 누르면 처음 저장한 금액으로 이어서 한다

import { z } from 'zod';

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { ok } from '@/lib/result';
import { toAdminReason } from '@/server/admin/reason';
import { requireAdmin } from '@/server/auth';
import { notifyReservationVoided } from '@/server/notifications/alerts';

import type { VoidedReservation, VoidPreview } from './types';
import { voidFail, type VoidResult } from './void-errors';
import { runVoidRefund } from './void-flow';
import { voidBlockReason, voidRefundAmount } from './void-rules';
import {
  finishVoid,
  lockVoidTarget,
  readVoidTarget,
  startVoid,
  type VoidTarget,
} from './void-store';

const idSchema = z.uuid();

/** 무효 확인 창의 값(금액과 막힌 이유). 화면은 금액을 계산하지 않고 이 값을 보여준다 */
export async function previewVoidReservation(
  reservationId: string,
): Promise<VoidResult<VoidPreview>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!idSchema.safeParse(reservationId).success) return voidFail('RESERVATION_NOT_FOUND');
  const target = await readVoidTarget(getDb(), reservationId);
  if (!target) return voidFail('RESERVATION_NOT_FOUND');
  // 진행 중인 무효는 이어서 할 수 있다
  const blockReason = target.voidRequested && !target.voidedAt ? null : voidBlockReason(target);
  return ok({
    reservationId,
    voidable: blockReason === null,
    blockReason,
    paidAmount: target.paidAmount,
    refundedAmount: target.refundedAmount,
    refundAmount: voidRefundAmount(target),
    usedCouponAmount: target.usedCouponAmount,
  });
}

/** 예약 무효. 끝나면 이번에 돌려준 금액과 무효 시각 */
export async function voidReservation(input: {
  reservationId: string;
  /** 원장님이 요청한 내용(필수). 예: "11/14 통화, 손님과 합의가 안 돼 전액 환불 요청" */
  ownerRequest: string;
}): Promise<VoidResult<VoidedReservation>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!idSchema.safeParse(input?.reservationId).success) return voidFail('RESERVATION_NOT_FOUND');
  const ownerRequest = toAdminReason(input?.ownerRequest);
  if (!ownerRequest.ok) return voidFail(ownerRequest.problem);
  const now = await getRequestNow();
  const db = getDb();
  const record = { adminId: auth.data.userId, ownerRequest: ownerRequest.reason };

  const target = await readVoidTarget(db, input.reservationId);
  if (!target) return voidFail('RESERVATION_NOT_FOUND');
  if (target.voidedAt) return voidFail('ALREADY_VOIDED');
  const refundAmount = voidRefundAmount(target);

  if (!target.voidRequested) {
    const blocked = voidBlockReason(target);
    if (blocked) return voidFail(blocked);
    if (refundAmount === 0) return finishWithoutRefund(target, record, now);
    try {
      const started = await startVoid(db, {
        reservationId: target.reservationId,
        orderId: target.orderId,
        refundAmount,
        ...record,
        now,
      });
      if (started !== 'started') return voidFail(started);
    } catch (error) {
      logVoidError('무효 시작 저장 실패:', target.reservationId, error);
      return voidFail('REFUND_FAILED');
    }
  }

  const outcome = await runVoidRefund(db, { ...target, refundAmount }, now);
  switch (outcome.state) {
    case 'finished':
      return ok({
        reservationId: target.reservationId,
        refundAmount: outcome.refundAmount,
        voidedAt: now.toISOString(),
      });
    case 'already':
      return voidFail('ALREADY_VOIDED');
    case 'pending':
      return voidFail('VOID_FINISHING');
    case 'failed':
      return voidFail('REFUND_FAILED');
  }
}

/** 돌려줄 돈이 없는 무효: 예약 줄을 잠그고 다시 확인한 뒤 한 트랜잭션에서 끝낸다(처리 기록도 같이) */
async function finishWithoutRefund(
  target: VoidTarget,
  record: { adminId: string; ownerRequest: string },
  now: Date,
): Promise<VoidResult<VoidedReservation>> {
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const locked = await lockVoidTarget(tx, target.reservationId);
    if (!locked) return 'RESERVATION_NOT_FOUND' as const;
    const blocked = voidBlockReason(locked) ?? (locked.voidRequested ? 'CANCEL_IN_PROGRESS' : null);
    if (blocked) return blocked;
    // 환불은 남은 금액을 줄이기만 해서, 잠그기 전에 0원이었으면 지금도 0원이다
    return finishVoid(tx, {
      reservationId: locked.reservationId,
      orderId: locked.orderId,
      slotId: locked.slotId,
      startAt: locked.startAt,
      refundAmount: 0,
      pgCancellationId: null,
      now,
      record,
    });
  });
  if (result === null) return voidFail('ALREADY_VOIDED');
  if (typeof result === 'string') return voidFail(result);
  notifyReservationVoided(db, target.reservationId, {
    refundAmount: 0,
    couponReturned: result.couponReturned,
  });
  return ok({ reservationId: target.reservationId, refundAmount: 0, voidedAt: now.toISOString() });
}

function logVoidError(message: string, reservationId: string, error: unknown) {
  console.error(
    `[void] ${message}`,
    reservationId,
    error instanceof Error ? error.name : 'unknown',
  );
}
