// 이의제기 접수: DB 읽기·저장 (C-507, #299, W19 ①). 서버에서만 부른다. 규칙 판단은 rules.ts가 한다.
// 내용(content)은 고객이 쓴 글이라 로그에 남기지 않는다.

import 'server-only';

import { and, asc, eq } from 'drizzle-orm';

import type { getDb } from '@/db';
import { type DisputeStatus, type DisputeType, disputes, reservations, slots } from '@/db/schema';
import type { ReservationStatus, VisitResult } from '@/db/schema/payments';

import type { DisputeTarget } from './rules';

type Tx = Pick<ReturnType<typeof getDb>, 'select' | 'insert'>;

export type DisputeRecord = { type: DisputeType; status: DisputeStatus; createdAt: Date };

/**
 * 내 예약의 규칙 값과 이미 접수한 이의제기(가장 먼저 접수한 것). 내 예약이 아니면 null.
 * lock이면 예약 줄을 잠근다(트랜잭션 안에서, 두 번 눌러도 한 번만 접수되게). 매물 줄은 잠그지 않는다
 */
export async function readDisputeTarget(
  tx: Tx,
  input: { reservationId: string; customerId: string; lock?: boolean },
): Promise<(DisputeTarget & { dispute: DisputeRecord | null }) | null> {
  const query = tx
    .select({
      status: reservations.status,
      startAt: slots.startAt,
      visitResult: reservations.visitResult,
      visitRecordedAt: reservations.visitRecordedAt,
      cancelledAt: reservations.cancelledAt,
    })
    .from(reservations)
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .where(
      and(eq(reservations.id, input.reservationId), eq(reservations.customerId, input.customerId)),
    );
  const [row] = input.lock ? await query.for('update', { of: reservations }) : await query;
  if (!row) return null;

  const [dispute] = await tx
    .select({ type: disputes.type, status: disputes.status, createdAt: disputes.createdAt })
    .from(disputes)
    .where(eq(disputes.reservationId, input.reservationId))
    .orderBy(asc(disputes.createdAt))
    .limit(1);
  return {
    // DB의 check 제약이 정해진 값만 허용한다
    status: row.status as ReservationStatus,
    startAt: row.startAt,
    visitResult: row.visitResult as VisitResult | null,
    visitRecordedAt: row.visitRecordedAt,
    cancelledAt: row.cancelledAt,
    dispute: dispute
      ? {
          type: dispute.type as DisputeType,
          status: dispute.status as DisputeStatus,
          createdAt: dispute.createdAt,
        }
      : null,
  };
}

/** 고객이 앱에서 접수한 이의제기를 '확인 중'(open)으로 저장한다 */
export async function insertDispute(
  tx: Tx,
  input: { reservationId: string; type: DisputeType; content: string },
): Promise<{ id: string; createdAt: Date }> {
  const [saved] = await tx
    .insert(disputes)
    .values({ ...input, status: 'open' })
    .returning({ id: disputes.id, createdAt: disputes.createdAt });
  return saved;
}
