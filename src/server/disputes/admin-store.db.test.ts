// 운영자 이의제기 처리 저장(카카오톡 채널 등록, 결론 기록)과 정산 보류 조건(hasOpenDispute)을 실제 DB(TEST_DATABASE_URL이
// 있을 때만)로 확인한다 (A-104, #350, W19 ②). 입력 확인과 실패 코드는 admin.test.ts가 본다.

import { and, eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { adminActions, disputes, reservations } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  createTestUser,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import { insertKakaoDispute, readDisputeToResolve, resolveDisputeInTx } from './admin-store';
import { hasOpenDispute } from './conditions';
import { readDisputeTarget } from './dispute-store';

const RECEIVED_AT = new Date('2026-11-02T10:00:00+09:00');
const NOW = new Date('2026-11-02T15:00:00+09:00');

/** 샵·고객·이용 완료 예약(노쇼면 visitResult no_show) */
async function completedReservation(tx: TestTx, visitResult: 'visited' | 'no_show') {
  const shop = await createTestShop(tx, { status: 'approved' });
  const { customerId } = await createTestCustomer(tx);
  const { reservation } = await createTestReservation(
    tx,
    shop,
    customerId,
    '10:00',
    '11:00',
    'completed',
    { visitResult, visitRecordedAt: new Date('2026-11-01T11:00:00+09:00') },
  );
  return reservation.id;
}

async function actionsOn(tx: TestTx, targetId: string) {
  return tx
    .select({ action: adminActions.action, adminId: adminActions.adminId, memo: adminActions.memo })
    .from(adminActions)
    .where(eq(adminActions.targetId, targetId));
}

/** 정산 보류 조건으로 그 예약을 본다 */
async function held(tx: TestTx, reservationId: string) {
  const [row] = await tx
    .select({ id: reservations.id })
    .from(reservations)
    .where(and(eq(reservations.id, reservationId), hasOpenDispute(reservations.id)));
  return row !== undefined;
}

describeDb('운영자 이의제기 처리 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('카카오톡 채널 건은 받은 시각·등록한 운영자와 함께 확인 중으로 저장하고 작업 기록(dispute.register)을 남긴다. 운영자는 고객을 가리지 않고 예약을 읽는다', async () => {
    await withRollback(async (tx) => {
      const adminId = await createTestUser(tx);
      const reservationId = await completedReservation(tx, 'visited');
      expect(
        await readDisputeTarget(tx, { reservationId, customerId: null, lock: true }),
      ).toMatchObject({ status: 'completed', visitResult: 'visited', dispute: null });

      const saved = await insertKakaoDispute(tx, {
        reservationId,
        type: 'after_start',
        content: '시술이 약속과 달랐어요',
        receivedAt: RECEIVED_AT,
        adminId,
      });
      const [row] = await tx.select().from(disputes).where(eq(disputes.id, saved.id));
      expect(row).toMatchObject({
        reservationId,
        type: 'after_start',
        status: 'open',
        channel: 'kakao',
        receivedAt: RECEIVED_AT,
        registeredBy: adminId,
        outcome: null,
      });
      expect(await actionsOn(tx, saved.id)).toEqual([
        { action: 'dispute.register', adminId, memo: 'after_start' },
      ]);
      expect(await held(tx, reservationId)).toBe(true);
      expect(await readDisputeTarget(tx, { reservationId, customerId: null })).toMatchObject({
        dispute: { id: saved.id, status: 'open' },
      });
    });
  });

  it('노쇼 취소 결론: 같은 트랜잭션에서 예약을 방문으로 바꾸고(visit.override) 결론·메모·운영자·시각을 남기며, 정산 보류가 풀린다', async () => {
    await withRollback(async (tx) => {
      const adminId = await createTestUser(tx);
      const reservationId = await completedReservation(tx, 'no_show');
      const { id } = await insertKakaoDispute(tx, {
        reservationId,
        type: 'no_show',
        content: '방문했는데 노쇼로 처리됐어요',
        receivedAt: RECEIVED_AT,
        adminId,
      });
      const dispute = await readDisputeToResolve(tx, id);
      expect(dispute).toEqual({
        disputeId: id,
        reservationId,
        status: 'open',
        reservationStatus: 'completed',
        visitResult: 'no_show',
      });

      await resolveDisputeInTx(tx, {
        dispute: dispute!,
        outcome: 'no_show_reversed',
        memo: '원장님이 방문을 확인함',
        adminId,
        now: NOW,
      });
      const [reservation] = await tx
        .select({ visitResult: reservations.visitResult, status: reservations.status })
        .from(reservations)
        .where(eq(reservations.id, reservationId));
      expect(reservation).toEqual({ visitResult: 'visited', status: 'completed' });
      const [row] = await tx.select().from(disputes).where(eq(disputes.id, id));
      expect(row).toMatchObject({
        status: 'resolved',
        outcome: 'no_show_reversed',
        result: '원장님이 방문을 확인함',
        handledBy: adminId,
        handledAt: NOW,
      });
      expect(await actionsOn(tx, reservationId)).toEqual([
        { action: 'visit.override', adminId, memo: '원장님이 방문을 확인함' },
      ]);
      expect((await actionsOn(tx, id)).map((action) => [action.action, action.memo])).toEqual([
        ['dispute.register', 'no_show'],
        ['dispute.resolve', 'no_show_reversed: 원장님이 방문을 확인함'],
      ]);
      expect(await held(tx, reservationId)).toBe(false);
      expect(await readDisputeToResolve(tx, id)).toMatchObject({ status: 'resolved' });
    });
  });

  it('바꿀 것 없음·노쇼 확정 결론은 예약을 바꾸지 않는다. 이미 결론 난 것을 다시 기록하면 멈춘다. 없는 이의제기는 null', async () => {
    await withRollback(async (tx) => {
      const adminId = await createTestUser(tx);
      const reservationId = await completedReservation(tx, 'no_show');
      const { id } = await insertKakaoDispute(tx, {
        reservationId,
        type: 'no_show',
        content: '노쇼 처리에 이의가 있어요',
        receivedAt: RECEIVED_AT,
        adminId,
      });
      const dispute = (await readDisputeToResolve(tx, id))!;
      await resolveDisputeInTx(tx, {
        dispute,
        outcome: 'no_show_confirmed',
        memo: '원장님 기록과 대화 확인, 노쇼 맞음',
        adminId,
        now: NOW,
      });
      const [reservation] = await tx
        .select({ visitResult: reservations.visitResult })
        .from(reservations)
        .where(eq(reservations.id, reservationId));
      expect(reservation.visitResult).toBe('no_show');
      expect(await actionsOn(tx, reservationId)).toEqual([]);
      expect(await held(tx, reservationId)).toBe(false);

      await expect(
        tx.transaction((t) =>
          resolveDisputeInTx(t, { dispute, outcome: 'no_change', memo: '다시', adminId, now: NOW }),
        ),
      ).rejects.toThrow('확인 중인 이의제기가 아니에요');
      expect(await readDisputeToResolve(tx, crypto.randomUUID())).toBeNull();
    });
  });
});
