'use server';

// 환불 미리보기·예약 취소 (C-503, X-202·X-203, 연결 #9, #128). 내 예약 상세의 '예약 취소'(정찬형 J13)에서 부른다.
// 화면에서는 '@/server/refunds/cancel'에서 가져온다. 환불액은 화면에서 계산하지 않고 이 결과를 그대로 보여준다.
//
// - previewRefund: 진짜(읽기만 한다). 금액은 calcRefund(#125)와 같은 계산이다
// - cancelReservation: 포트원에서 환불액만 돌려준 뒤, 예약·매물을 '취소'로 바꾸고 환불 기록을 남긴다(W14).
//   포트원을 부르는 동안 DB를 잠그지 않는다. 환불 뒤 저장하지 못하고 멈춰도 다시 누르면 포트원이 앞선 환불을 알려줘서 두 번 환불되지 않는다

import { z } from 'zod';

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { ok } from '@/lib/result';
import { hoursUntil } from '@/lib/time';
import { requireCustomer } from '@/server/auth';

import { calcRefund } from './calc-refund';
import { refundFail, type RefundResult } from './errors';
import { refundPayment } from './refund-payment';
import { readRefundTarget, recordCustomerCancel, type RefundTarget } from './refund-store';
import type { CancelledReservation, RefundPreview } from './types';

const reservationIdSchema = z.uuid();

function toPreview(target: RefundTarget, now: Date): RefundPreview {
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

  const refund = await refundPayment({
    paymentId: target.paymentId,
    paidAmount: target.paidAmount,
    refundAmount: preview.refundAmount,
  });
  if (!refund.ok) return refundFail('REFUND_FAILED');
  // 앞선 요청이 돌려준 금액이 지금 계산과 다르면(그 사이 구간이 바뀜, 콘솔에서 직접 취소) 위약금 기록이 틀려져서 자동으로 기록하지 않는다
  if (refund.amount !== null && refund.amount !== preview.refundAmount) {
    console.error('[cancel] 돌려준 금액이 계산과 달라 운영자 확인이 필요해요:', reservationId);
    return refundFail('REFUND_FAILED');
  }

  let recorded: boolean;
  try {
    recorded = await getDb().transaction((tx) =>
      recordCustomerCancel(tx, {
        reservationId,
        orderId: target.orderId,
        slotId: target.slotId,
        band: preview.band,
        penaltyRate: preview.penaltyRate,
        refundAmount: preview.refundAmount,
        penaltyAmount: preview.penaltyAmount,
        pgCancellationId: refund.cancellationId,
        hoursBeforeStart: hoursUntil(target.startAt, now),
        now,
      }),
    );
  } catch (error) {
    // 환불은 끝났을 수 있다. 다시 누르면 앞선 환불을 읽어 기록한다
    console.error(
      '[cancel] 환불 뒤 저장 실패:',
      reservationId,
      error instanceof Error ? error.name : error,
    );
    return refundFail('REFUND_FAILED');
  }
  if (!recorded) return refundFail('ALREADY_CANCELLED');

  return ok({
    reservationId,
    refundAmount: preview.refundAmount,
    cancelledAt: now.toISOString(),
  });
}
