// 방문·노쇼 처리 저장 (DB, 연결 #11, #130, S-405·S-406). 서버에서만 부른다.
// 화면이 부르는 'use server' 함수(record-visit.ts)가 원장님 로그인·입력을 확인한 뒤 이 함수를 트랜잭션 안에서 부른다.
// 'use server' 파일에서 내보내는 함수는 화면에서 바로 부를 수 있으므로, tx를 받고 권한 확인이 없는 함수는 여기에 둔다.

import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';

import type { getDb } from '@/db';
import {
  refunds,
  type ReservationStatus,
  reservations,
  slots,
  type VisitResult,
} from '@/db/schema';
import { ok, type Result } from '@/lib/result';

import { visitFail } from './errors';
import { visitBlockReason } from './rules';
import type { RecordedVisit } from './types';

type Db = Pick<ReturnType<typeof getDb>, 'select' | 'update'>;

/**
 * 이 샵의 예약을 방문 완료·노쇼로 처리한다. 트랜잭션 안에서 부른다.
 * 예약·매물 줄을 잠그고(FOR UPDATE) 상태를 본 뒤 바꿔서, 동시에 두 번 눌러도 한 번만 처리되고 두 번째는 ALREADY_RECORDED다.
 * 처리하면 예약은 이용 완료 + 방문 결과·처리 시각·처리한 사람, 매물은 '완료'.
 * 손님 취소·합의 후 취소의 환불이 진행 중이면 막는다(CANCEL_IN_PROGRESS). 합의 후 취소는 시작 뒤에도 할 수 있어서,
 * 환불이 도는 사이 방문 처리가 끼면 돈은 돌아갔는데 예약이 '완료'로 남을 수 있다(#320)
 * 정산 내역(settlement_items)은 결제 수수료율이 정해진 뒤(W15·W20) 처리된 예약에서 만든다
 */
export async function recordVisitInTx(
  tx: Db,
  input: {
    shopId: string;
    reservationId: string;
    result: VisitResult;
    /** 처리한 원장님(profiles.id) */
    recordedBy: string;
    /** 서버 시각. 시작 전인지 보는 기준이자 처리 시각 */
    now: Date;
  },
): Promise<Result<RecordedVisit>> {
  const [target] = await tx
    .select({
      status: reservations.status,
      visitResult: reservations.visitResult,
      slotId: reservations.slotId,
      startAt: slots.startAt,
    })
    .from(reservations)
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .where(and(eq(reservations.id, input.reservationId), eq(slots.shopId, input.shopId)))
    .for('update');
  // 남의 샵 예약도 '없음'으로 답해서 있는지조차 알려주지 않는다
  if (!target) return visitFail('RESERVATION_NOT_FOUND');

  const blocked = visitBlockReason(
    {
      // DB의 check 제약이 정해진 값만 허용한다
      status: target.status as ReservationStatus,
      visitResult: target.visitResult as VisitResult | null,
      startAt: target.startAt,
    },
    input.now,
  );
  if (blocked) return visitFail(blocked);
  // 취소 환불은 예약 줄을 잠근 뒤 진행 중 기록을 넣으므로, 같은 줄을 잠근 지금 보면 겹치지 않는다
  const [pending] = await tx
    .select({ id: refunds.id })
    .from(refunds)
    .where(
      and(
        eq(refunds.reservationId, input.reservationId),
        inArray(refunds.reason, ['customer_cancel', 'agreed_cancel']),
        eq(refunds.status, 'requested'),
      ),
    )
    .limit(1);
  if (pending) return visitFail('CANCEL_IN_PROGRESS');

  await tx
    .update(reservations)
    .set({
      status: 'completed',
      visitResult: input.result,
      visitRecordedAt: input.now,
      visitRecordedBy: input.recordedBy,
    })
    .where(eq(reservations.id, input.reservationId));
  // 노쇼도 매물은 '완료'다(노쇼는 매물 상태가 아니라 예약에 기록한다, S-405)
  await tx.update(slots).set({ status: 'completed' }).where(eq(slots.id, target.slotId));

  return ok({
    reservationId: input.reservationId,
    visitResult: input.result,
    recordedAt: input.now.toISOString(),
  });
}
