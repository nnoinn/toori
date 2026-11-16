// 운영자가 원장님 대신 하는 방문·노쇼 처리와 노쇼 되돌리기(#373 ③)의 읽기·저장. 서버에서만 부른다.
// 대신 처리 자체는 원장님과 같은 recordVisitInTx가 하고, 여기는 그 앞의 샵 찾기와 노쇼 되돌리기만 한다.

import 'server-only';

import { and, eq } from 'drizzle-orm';

import type { getDb } from '@/db';
import { disputes, reservations, settlementItems, slots } from '@/db/schema';
import { ok, type Result } from '@/lib/result';
import { recordAdminAction } from '@/server/admin/action-store';

import { adminVisitFail } from './admin-errors';

type Tx = Pick<ReturnType<typeof getDb>, 'select' | 'insert' | 'update'>;
type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

/** 예약의 샵 id. 없는 예약이면 null */
export async function readReservationShopId(
  db: DbReader,
  reservationId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ shopId: slots.shopId })
    .from(reservations)
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .where(eq(reservations.id, reservationId));
  return row?.shopId ?? null;
}

/**
 * 노쇼를 방문으로 되돌린다(#373 ③, 원장님이 잘못 누른 노쇼). 트랜잭션 안에서 부른다.
 * 예약 줄을 잠그고(FOR UPDATE) 본 뒤 바꿔서, 두 운영자가 동시에 눌러도 한 번만 되고 두 번째는 NOT_NO_SHOW다.
 * 이의제기가 확인 중이면 DISPUTE_OPEN(결론으로 한다), 이미 정산에 묶였으면 SETTLEMENT_BUNDLED(11/16, 묶이기 전까지만).
 * 이의제기 결론 "노쇼 취소"와 같은 처리라 같은 작업 기록(visit.override)을 같은 트랜잭션에서 남긴다. 돈은 그대로 판매가로 정산된다.
 * 정산 묶기는 예약 줄을 잠그지 않는다. 지급일 새벽에 겹치면 노쇼 줄로 묶일 수 있지만, 노쇼와 방문은 정산 금액이 같다
 */
export async function reverseNoShowInTx(
  tx: Tx,
  input: { reservationId: string; adminId: string; reason: string },
): Promise<Result<{ reservationId: string }>> {
  const [target] = await tx
    .select({ visitResult: reservations.visitResult, orderId: reservations.orderId })
    .from(reservations)
    .where(eq(reservations.id, input.reservationId))
    .for('update');
  if (!target) return adminVisitFail('RESERVATION_NOT_FOUND');
  if (target.visitResult !== 'no_show') return adminVisitFail('NOT_NO_SHOW');

  const [openDispute] = await tx
    .select({ id: disputes.id })
    .from(disputes)
    .where(and(eq(disputes.reservationId, input.reservationId), eq(disputes.status, 'open')))
    .limit(1);
  if (openDispute) return adminVisitFail('DISPUTE_OPEN');

  const [bundled] = await tx
    .select({ id: settlementItems.id })
    .from(settlementItems)
    .where(eq(settlementItems.orderId, target.orderId))
    .limit(1);
  if (bundled) return adminVisitFail('SETTLEMENT_BUNDLED');

  await tx
    .update(reservations)
    .set({ visitResult: 'visited' })
    .where(eq(reservations.id, input.reservationId));
  await recordAdminAction(tx, {
    adminId: input.adminId,
    action: 'visit.override',
    targetType: 'reservation',
    targetId: input.reservationId,
    memo: input.reason,
  });
  return ok({ reservationId: input.reservationId });
}
