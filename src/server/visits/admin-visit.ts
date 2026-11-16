'use server';

// 운영자가 원장님 대신 하는 방문·노쇼 처리와 잘못 누른 노쇼 되돌리기 (#373 ③, 11/16 결정). 운영자 예약 상세(/admin/reservations/[id],
// 강규민)에서 부른다. 모두 운영자만(requireAdmin)이고 사유가 필수다. 처리 기록은 데이터를 바꾸는 같은 트랜잭션에서 남긴다.
//
// - recordVisitAsAdmin: 원장님 함수(recordVisitInTx)를 그 예약의 샵으로 그대로 불러서 결과와 금액이 원장님이 한 것과 같다
//   (시작 전·취소 진행 중·이미 처리함 막기도 같다). 처리 기록 visit.record("결과: 사유"). 노쇼면 손님에게 원장님이 했을 때와 같은
//   노쇼 알림이 가고, 원장님에게는 운영자가 대신 처리했다는 알림이 간다
// - reverseNoShowAsAdmin: 노쇼를 방문으로 바꾼다. 확인 중인 이의제기가 있으면 결론으로 하게 막고, 정산에 묶인 뒤에는 막는다.
//   처리 기록 visit.override(이의제기 결론 "노쇼 취소"와 같다). 손님·원장님에게 바로잡혔다는 알림이 간다

import { z } from 'zod';

import { getDb } from '@/db';
import { VISIT_RESULTS, type VisitResult } from '@/db/schema';
import { getRequestNow } from '@/lib/request-time';
import type { Result } from '@/lib/result';
import { recordAdminAction } from '@/server/admin/action-store';
import { toAdminReason } from '@/server/admin/reason';
import { requireAdmin } from '@/server/auth';
import {
  notifyNoShow,
  notifyNoShowReversed,
  notifyVisitRecordedByAdmin,
} from '@/server/notifications/alerts';

import { adminVisitFail } from './admin-errors';
import { readReservationShopId, reverseNoShowInTx } from './admin-visit-store';
import type { RecordedVisit } from './types';
import { recordVisitInTx } from './visit-store';

const idSchema = z.uuid();
const resultSchema = z.enum(VISIT_RESULTS);

/** 원장님 대신 방문 완료·노쇼로 처리한다. 실패 코드는 원장님 처리(recordVisit)와 같고 사유가 비면 REASON_REQUIRED */
export async function recordVisitAsAdmin(input: {
  reservationId: string;
  result: VisitResult;
  reason: string;
}): Promise<Result<RecordedVisit>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!idSchema.safeParse(input?.reservationId).success) {
    return adminVisitFail('RESERVATION_NOT_FOUND');
  }
  const result = resultSchema.safeParse(input?.result);
  if (!result.success) return adminVisitFail('INVALID_INPUT');
  const reason = toAdminReason(input?.reason);
  if (!reason.ok) return adminVisitFail(reason.problem);

  const now = await getRequestNow();
  const db = getDb();
  const recorded = await db.transaction(async (tx): Promise<Result<RecordedVisit>> => {
    const shopId = await readReservationShopId(tx, input.reservationId);
    if (!shopId) return adminVisitFail('RESERVATION_NOT_FOUND');
    const visit = await recordVisitInTx(tx, {
      shopId,
      reservationId: input.reservationId,
      result: result.data,
      recordedBy: auth.data.userId,
      now,
    });
    if (!visit.ok) return visit;
    await recordAdminAction(tx, {
      adminId: auth.data.userId,
      action: 'visit.record',
      targetType: 'reservation',
      targetId: input.reservationId,
      memo: `${result.data}: ${reason.reason}`,
    });
    return visit;
  });
  if (recorded.ok) {
    if (result.data === 'no_show') notifyNoShow(db, input.reservationId);
    notifyVisitRecordedByAdmin(db, input.reservationId, result.data);
  }
  return recorded;
}

/** 잘못 누른 노쇼를 방문으로 되돌린다. NOT_NO_SHOW·DISPUTE_OPEN·SETTLEMENT_BUNDLED로 막고 사유가 비면 REASON_REQUIRED */
export async function reverseNoShowAsAdmin(input: {
  reservationId: string;
  reason: string;
}): Promise<Result<{ reservationId: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!idSchema.safeParse(input?.reservationId).success) {
    return adminVisitFail('RESERVATION_NOT_FOUND');
  }
  const reason = toAdminReason(input?.reason);
  if (!reason.ok) return adminVisitFail(reason.problem);

  const db = getDb();
  const reversed = await db.transaction((tx) =>
    reverseNoShowInTx(tx, {
      reservationId: input.reservationId,
      adminId: auth.data.userId,
      reason: reason.reason,
    }),
  );
  if (reversed.ok) notifyNoShowReversed(db, input.reservationId);
  return reversed;
}
