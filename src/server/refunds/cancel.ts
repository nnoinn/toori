'use server';

// 환불 미리보기·예약 취소 (C-503, X-202·X-203, 연결 #9, #128). 내 예약 상세의 '예약 취소'(정찬형 J13)에서 부른다.
// 화면에서는 '@/server/refunds/cancel'에서 가져온다. 환불액은 화면에서 계산하지 않고 이 결과를 그대로 보여준다.
//
// - previewRefund: 진짜(읽기만 한다). 금액은 calcRefund(#125)와 같은 계산이다
// - cancelReservation: 진행 중(requested)으로 먼저 저장하고, 포트원에서 환불액만 돌려준 뒤, 예약·매물을 '취소'로 바꾸고 기록을 끝낸다(W14, #222).
//   진행 순서는 원장님 귀책 취소와 같이 쓴다(cancel-flow.ts). 중간에 멈추면 정리 작업(sweep-cancels.ts)이 마무리한다

import { z } from 'zod';

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { ok } from '@/lib/result';
import { requireCustomer } from '@/server/auth';

import { calcRefund } from './calc-refund';
import { runCancelRefund } from './cancel-flow';
import { refundFail, type RefundResult } from './errors';
import { CUSTOMER_CANCEL_REASON } from './refund-payment';
import { readRefundTarget, type RefundTarget } from './refund-store';
import type { CancelledReservation, RefundPreview } from './types';

const reservationIdSchema = z.uuid();

function toPreview(target: RefundTarget, now: Date): RefundPreview {
  // 진행 중인 고객 취소가 있으면 새로 계산하지 않는다. 그 사이 구간이 바뀌어도 금액이 어긋나지 않는다
  if (
    target.requested?.reason === 'customer_cancel' &&
    target.requested.band &&
    target.status === 'confirmed'
  ) {
    const { band, penaltyRate, refundAmount, penaltyAmount } = target.requested;
    return {
      reservationId: target.reservationId,
      refundable: true,
      band,
      penaltyRate,
      paidAmount: target.paidAmount,
      refundAmount,
      penaltyAmount,
      couponAmount: target.couponAmount,
      startAt: target.startAt.toISOString(),
      serverNow: now.toISOString(),
    };
  }
  const calc = calcRefund({
    paidAmount: target.paidAmount,
    salePrice: target.salePrice,
    startAt: target.startAt,
    now,
  });
  if (calc.band === null) throw new Error('고객 취소에는 위약금 구간이 있어야 해요');
  return {
    reservationId: target.reservationId,
    // 취소할 수 있는지는 남은 시간으로 정한다(6시간 미만·시작 뒤는 막는다, 10/29 결정). 쿠폰으로 결제액이 0원이어도 시간 안이면 취소할 수 있다
    refundable: calc.band !== 'under_6h',
    band: calc.band,
    penaltyRate: calc.penaltyRate,
    paidAmount: target.paidAmount,
    refundAmount: calc.refundAmount,
    penaltyAmount: calc.penaltyAmount,
    couponAmount: target.couponAmount,
    startAt: target.startAt.toISOString(),
    serverNow: now.toISOString(),
  };
}

/** 취소 화면을 열 때(C-503). 내 예약만. refundable이 false면 화면은 취소 버튼 대신 안내를 보여준다 */
export async function previewRefund(reservationId: string): Promise<RefundResult<RefundPreview>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  const id = reservationIdSchema.safeParse(reservationId);
  if (!id.success) return refundFail('RESERVATION_NOT_FOUND');

  const target = await readRefundTarget(id.data, auth.data.customerId);
  if (!target) return refundFail('RESERVATION_NOT_FOUND');
  if (target.status === 'cancelled') return refundFail('ALREADY_CANCELLED');
  return ok(toPreview(target, await getRequestNow()));
}

const cancelSchema = z.object({
  reservationId: z.uuid(),
  expectedRefundAmount: z.number().int().nonnegative(),
});

/**
 * '취소하기'. 미리보기에서 본 환불액(expectedRefundAmount)을 같이 보낸다. 그 사이 구간이 바뀌어 금액이 달라졌으면
 * REFUND_CHANGED와 새 미리보기를 돌려준다(화면은 바뀐 금액으로 다시 확인받는다)
 */
export async function cancelReservation(input: {
  reservationId: string;
  expectedRefundAmount: number;
}): Promise<RefundResult<CancelledReservation>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return refundFail('INVALID_INPUT');
  const { reservationId, expectedRefundAmount } = parsed.data;

  const target = await readRefundTarget(reservationId, auth.data.customerId);
  if (!target) return refundFail('RESERVATION_NOT_FOUND');
  if (target.status === 'cancelled') return refundFail('ALREADY_CANCELLED');
  const now = await getRequestNow();
  const preview = toPreview(target, now);

  if (!preview.refundable) return refundFail('NOT_REFUNDABLE');
  if (preview.refundAmount !== expectedRefundAmount) {
    return refundFail('REFUND_CHANGED', { preview });
  }

  // 다른 취소 환불이 진행 중이다(손님이 같은 순간 합의 후 취소에 동의함, 원장님 귀책 취소). 한 예약에 취소 환불은 하나라 그쪽이 끝낸다
  if (target.requested && target.requested.reason !== 'customer_cancel') {
    return refundFail('CANCEL_FINISHING');
  }
  const requested = target.requested ?? {
    reason: 'customer_cancel' as const,
    band: preview.band,
    penaltyRate: preview.penaltyRate,
    refundAmount: preview.refundAmount,
    penaltyAmount: preview.penaltyAmount,
    requestedAt: now,
  };
  return runCancelRefund(getDb(), {
    target,
    requested,
    now,
    pgReason: CUSTOMER_CANCEL_REASON,
  });
}
