// 이의제기 접수 경로·결론 종류 칸과 규칙(마이그레이션 0013, #350)을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// - 카카오톡 채널 건이면 등록한 운영자가 꼭 있고, 앱 접수면 비어 있다(양쪽, #350 리뷰)
// - 결론(resolved)이면 결론 종류가 꼭 있고, 확인 중(open)이면 비어 있다. 결론 종류 6개는 DB에 모두 들어간다
// - 한 예약에 이의제기 하나

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { DISPUTE_OUTCOMES, disputes } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  createTestUser,
  type TestShop,
} from '../../tests/db/fixtures';
import {
  closeTestDb,
  describeDb,
  type TestTx,
  violatedConstraint,
  withRollback,
} from '../../tests/db/test-db';

const RECEIVED_AT = new Date('2026-11-02T10:00:00+09:00');

/** 샵에 끝난 예약 하나('HH:MM', fixtures와 같은 날) */
async function completedReservation(tx: TestTx, shop: TestShop, start: string, end: string) {
  const { customerId } = await createTestCustomer(tx);
  const { reservation } = await createTestReservation(
    tx,
    shop,
    customerId,
    start,
    end,
    'completed',
  );
  return reservation.id;
}

function dispute(
  reservationId: string,
  extra: Partial<typeof disputes.$inferInsert> = {},
): typeof disputes.$inferInsert {
  return {
    reservationId,
    type: 'no_show',
    content: '노쇼로 처리됐는데 방문했어요',
    status: 'open',
    channel: 'app',
    receivedAt: RECEIVED_AT,
    ...extra,
  };
}

describeDb('이의제기 접수 경로·결론 종류 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('카카오톡 채널 건은 등록한 운영자가 꼭 있고, 앱 접수는 비어 있어야 한다(disputes_registered_by_check)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const adminId = await createTestUser(tx);
      const appReservation = await completedReservation(tx, shop, '09:00', '10:00');
      const kakaoReservation = await completedReservation(tx, shop, '11:00', '12:00');
      const insert = (row: typeof disputes.$inferInsert) => (t: TestTx) =>
        t.insert(disputes).values(row);

      expect(
        await violatedConstraint(
          tx,
          insert(dispute(kakaoReservation, { channel: 'kakao', registeredBy: null })),
        ),
      ).toBe('disputes_registered_by_check');
      expect(
        await violatedConstraint(
          tx,
          insert(dispute(appReservation, { channel: 'app', registeredBy: adminId })),
        ),
      ).toBe('disputes_registered_by_check');
      expect(
        await violatedConstraint(
          tx,
          insert(dispute(appReservation, { channel: 'phone', registeredBy: null })),
        ),
      ).toBe('disputes_channel_check');

      expect(
        await violatedConstraint(
          tx,
          insert(dispute(kakaoReservation, { channel: 'kakao', registeredBy: adminId })),
        ),
      ).toBeUndefined();
      expect(await violatedConstraint(tx, insert(dispute(appReservation)))).toBeUndefined();
    });
  });

  it('결론(resolved)이면 결론 종류가 꼭 있고 확인 중(open)이면 비어 있다. 결론 종류 6개는 모두 저장된다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const adminId = await createTestUser(tx);
      const reservationId = await completedReservation(tx, shop, '09:00', '10:00');

      expect(
        await violatedConstraint(tx, (t) =>
          t.insert(disputes).values(dispute(reservationId, { outcome: 'no_change' })),
        ),
      ).toBe('disputes_outcome_status_check');
      expect(
        await violatedConstraint(tx, (t) =>
          t.insert(disputes).values(dispute(reservationId, { status: 'resolved' })),
        ),
      ).toBe('disputes_outcome_status_check');

      const [saved] = await tx.insert(disputes).values(dispute(reservationId)).returning();
      const resolveAs = (outcome: string) => (t: TestTx) =>
        t
          .update(disputes)
          .set({ status: 'resolved', outcome, handledBy: adminId, handledAt: RECEIVED_AT })
          .where(eq(disputes.id, saved.id));

      expect(await violatedConstraint(tx, resolveAs('refund'))).toBe('disputes_outcome_check');
      for (const outcome of DISPUTE_OUTCOMES) {
        expect(await violatedConstraint(tx, resolveAs(outcome)), outcome).toBeUndefined();
      }
      const [row] = await tx.select().from(disputes).where(eq(disputes.id, saved.id));
      expect([row.status, row.outcome]).toEqual(['resolved', 'no_change']);
    });
  });

  it('한 예약에 이의제기 하나: 앱으로 접수한 예약을 카카오톡 채널 건으로 또 등록할 수 없다(disputes_reservation_id_unique)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const adminId = await createTestUser(tx);
      const reservationId = await completedReservation(tx, shop, '09:00', '10:00');
      const other = await completedReservation(tx, shop, '11:00', '12:00');
      await tx.insert(disputes).values(dispute(reservationId));

      expect(
        await violatedConstraint(tx, (t) =>
          t
            .insert(disputes)
            .values(dispute(reservationId, { channel: 'kakao', registeredBy: adminId })),
        ),
      ).toBe('disputes_reservation_id_unique');
      expect(
        await violatedConstraint(tx, (t) => t.insert(disputes).values(dispute(other))),
      ).toBeUndefined();
    });
  });
});
