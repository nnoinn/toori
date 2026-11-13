// 운영자 이의제기 처리: DB 저장 (A-104, #350, W19 ②). 서버에서만 부른다. 트랜잭션 안에서 부른다. 규칙 판단은 rules.ts.
// 운영자가 데이터를 바꾸는 일은 같은 트랜잭션에서 작업 기록(admin_actions)을 남긴다(#350 4장, #372).
// 내용(content)·메모는 고객·운영자가 쓴 글이라 로그에 남기지 않는다.

import 'server-only';

import { and, eq } from 'drizzle-orm';

import type { getDb } from '@/db';
import {
  adminActions,
  type DisputeOutcome,
  type DisputeStatus,
  type DisputeType,
  disputes,
  reservations,
} from '@/db/schema';
import type { ReservationStatus, VisitResult } from '@/db/schema/payments';

type Tx = Pick<ReturnType<typeof getDb>, 'select' | 'insert' | 'update'>;

/** 카카오톡 채널로 받은 이의제기를 확인 중(open)으로 등록하고 작업 기록(dispute.register)을 남긴다 */
export async function insertKakaoDispute(
  tx: Tx,
  input: {
    reservationId: string;
    type: DisputeType;
    content: string;
    receivedAt: Date;
    adminId: string;
  },
): Promise<{ id: string; createdAt: Date }> {
  const [saved] = await tx
    .insert(disputes)
    .values({
      reservationId: input.reservationId,
      type: input.type,
      content: input.content,
      status: 'open',
      channel: 'kakao',
      receivedAt: input.receivedAt,
      registeredBy: input.adminId,
    })
    .returning({ id: disputes.id, createdAt: disputes.createdAt });
  await tx.insert(adminActions).values({
    adminId: input.adminId,
    action: 'dispute.register',
    targetType: 'dispute',
    targetId: saved.id,
    memo: input.type,
  });
  return saved;
}

/** 결론을 기록할 이의제기와 그 예약 */
export type DisputeToResolve = {
  disputeId: string;
  reservationId: string;
  status: DisputeStatus;
  reservationStatus: ReservationStatus;
  visitResult: VisitResult | null;
};

/** 결론을 기록할 이의제기와 예약을 같이 잠그고 읽는다(두 운영자가 동시에 기록해도 한 번만). 없으면 null */
export async function readDisputeToResolve(
  tx: Tx,
  disputeId: string,
): Promise<DisputeToResolve | null> {
  const [row] = await tx
    .select({
      disputeId: disputes.id,
      reservationId: disputes.reservationId,
      status: disputes.status,
      reservationStatus: reservations.status,
      visitResult: reservations.visitResult,
    })
    .from(disputes)
    .innerJoin(reservations, eq(reservations.id, disputes.reservationId))
    .where(eq(disputes.id, disputeId))
    .for('update', { of: [disputes, reservations] });
  if (!row) return null;
  // DB의 check 제약이 정해진 값만 허용한다
  return {
    ...row,
    status: row.status as DisputeStatus,
    reservationStatus: row.reservationStatus as ReservationStatus,
    visitResult: row.visitResult as VisitResult | null,
  };
}

/**
 * 결론을 기록한다(확인 중 → 결론). 결론이 나면 정산 보류가 저절로 풀린다(hasOpenDispute).
 * 노쇼 취소(no_show_reversed)면 같은 트랜잭션에서 예약을 방문으로 바꾸고 visit.override 작업 기록도 남긴다
 * (돈은 그대로 판매가로 정산된다, #350 5장). 작업 기록 dispute.resolve의 메모는 "결론 종류: 메모"
 */
export async function resolveDisputeInTx(
  tx: Tx,
  input: {
    dispute: DisputeToResolve;
    outcome: DisputeOutcome;
    memo: string;
    adminId: string;
    now: Date;
  },
): Promise<void> {
  const { dispute, outcome, memo, adminId, now } = input;
  if (outcome === 'no_show_reversed') {
    const [visited] = await tx
      .update(reservations)
      .set({ visitResult: 'visited' })
      .where(
        and(eq(reservations.id, dispute.reservationId), eq(reservations.visitResult, 'no_show')),
      )
      .returning({ id: reservations.id });
    if (!visited) throw new Error(`노쇼 예약이 아니에요: ${dispute.reservationId}`);
    await tx.insert(adminActions).values({
      adminId,
      action: 'visit.override',
      targetType: 'reservation',
      targetId: dispute.reservationId,
      memo,
    });
  }
  const [resolved] = await tx
    .update(disputes)
    .set({ status: 'resolved', outcome, result: memo, handledBy: adminId, handledAt: now })
    .where(and(eq(disputes.id, dispute.disputeId), eq(disputes.status, 'open')))
    .returning({ id: disputes.id });
  if (!resolved) throw new Error(`확인 중인 이의제기가 아니에요: ${dispute.disputeId}`);
  await tx.insert(adminActions).values({
    adminId,
    action: 'dispute.resolve',
    targetType: 'dispute',
    targetId: dispute.disputeId,
    memo: `${outcome}: ${memo}`,
  });
}
