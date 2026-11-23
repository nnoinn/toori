'use server';

// 운영자가 원장님 대신 하는 원장님 사정 취소 (#373 ③-2, S-409, X-207). 운영자 예약 정보(/admin/reservations/[id], 강규민)에서 부른다.
// 원장님이 못 할 때(전화로 요청 등) 운영자가 사유를 남기고 대신 한다. 운영자만(requireAdmin)이고 사유가 필수다.
//
// - 막는 조건·금액·진행 중 이어서 하기는 원장님 취소와 같은 판단(owner-fault-rules.ts)이고, 환불 진행도 같은 함수(cancel-flow.ts)라
//   결과와 금액이 원장님이 직접 한 것과 같다(#373 ③): 전액 환불, 쓴 쿠폰 돌려주기, 보상 쿠폰, 패널티, 손님 알림
// - 처리 기록(reservation.owner_fault_cancel)은 포트원 환불을 거쳐서 결과가 나온 뒤 "결과: 사유"로 남긴다(① 다시 시도와 같다).
//   막혀서 아무것도 하지 않았으면(없음·이미 취소·시작 뒤) 남기지 않는다
// - 바로 끝나면 원장님에게 운영자가 취소했다는 알림이 간다. 결과를 기다리다 정리 작업이 끝내면 이 알림은 가지 않는다

import { z } from 'zod';

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { recordAdminAction } from '@/server/admin/action-store';
import { toAdminReason } from '@/server/admin/reason';
import { requireAdmin } from '@/server/auth';
import { notifyOwnerFaultCancelledByAdmin } from '@/server/notifications/alerts';

import { adminOwnerFaultFail } from './admin-errors';
import { runCancelRefund } from './cancel-flow';
import { refundFail, type RefundResult } from './errors';
import { ownerFaultRequest } from './owner-fault-rules';
import { OWNER_FAULT_CANCEL_REASON } from './refund-payment';
import { readRefundTargetById } from './refund-store';
import type { CancelledReservation } from './types';

const idSchema = z.uuid();

/** 원장님 대신 원장님 사정으로 취소한다. 실패 코드는 원장님 취소(cancelByOwnerFault)와 같고 사유가 비면 REASON_REQUIRED */
export async function cancelByOwnerFaultAsAdmin(input: {
  reservationId: string;
  reason: string;
}): Promise<RefundResult<CancelledReservation>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!idSchema.safeParse(input?.reservationId).success) {
    return adminOwnerFaultFail('RESERVATION_NOT_FOUND');
  }
  const reason = toAdminReason(input?.reason);
  if (!reason.ok) return adminOwnerFaultFail(reason.problem);

  const db = getDb();
  const target = await readRefundTargetById(input.reservationId, db);
  if (!target) return adminOwnerFaultFail('RESERVATION_NOT_FOUND');
  const now = await getRequestNow();
  const request = ownerFaultRequest(target, now);
  if (!request.ok) return refundFail(request.code);

  let result: RefundResult<CancelledReservation>;
  try {
    result = await runCancelRefund(db, {
      target,
      requested: request.requested,
      now,
      pgReason: OWNER_FAULT_CANCEL_REASON,
    });
  } catch (error) {
    // 진행 중 기록이 남았으면 정리 작업이 마무리한다. 다시 누르면 저장해 둔 값으로 이어서 한다
    console.error(
      '[admin] 원장님 사정 취소 대신 처리 실패:',
      input.reservationId,
      error instanceof Error ? error.name : 'unknown',
    );
    result = refundFail('CANCEL_FINISHING');
  }
  await recordAdminAction(db, {
    adminId: auth.data.userId,
    action: 'reservation.owner_fault_cancel',
    targetType: 'reservation',
    targetId: input.reservationId,
    memo: `${result.ok ? 'cancelled' : result.error.code}: ${reason.reason}`,
  });
  if (result.ok) notifyOwnerFaultCancelledByAdmin(db, input.reservationId);
  return result;
}
