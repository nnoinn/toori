// 이의제기 접수의 DB 읽기·저장을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다 (#299, W19 ①).

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { disputes } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../tests/db/test-db';
import { insertDispute, readDisputeTarget } from './dispute-store';

type Db = Parameters<typeof readDisputeTarget>[0];

describeDb('이의제기 접수 저장 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('내 예약의 시작·방문 처리·취소 값을 읽고, 남의 예약은 null', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const other = await createTestCustomer(tx);
      const recordedAt = new Date('2026-11-01T10:30:00+09:00');
      const { reservation, slot } = await createTestReservation(
        tx,
        shop,
        me.customerId,
        '09:00',
        '10:00',
        'completed',
        { visitResult: 'no_show', visitRecordedAt: recordedAt },
      );

      for (const lock of [false, true]) {
        expect(
          await readDisputeTarget(db, {
            reservationId: reservation.id,
            customerId: me.customerId,
            lock,
          }),
        ).toEqual({
          status: 'completed',
          startAt: slot.startAt,
          visitResult: 'no_show',
          visitRecordedAt: recordedAt,
          cancelledAt: null,
          dispute: null,
        });
      }
      expect(
        await readDisputeTarget(db, {
          reservationId: reservation.id,
          customerId: other.customerId,
        }),
      ).toBeNull();
    });
  });

  it('확인 중(open)·앱 접수로 저장하고, 다시 읽으면 접수한 이의제기가 붙어 있다', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const { reservation } = await createTestReservation(
        tx,
        shop,
        me.customerId,
        '11:00',
        '12:00',
        'cancelled',
        { cancelledAt: new Date('2026-10-31T09:00:00+09:00'), cancelActor: 'customer' },
      );

      const saved = await insertDispute(db, {
        reservationId: reservation.id,
        type: 'refund_exception',
        content: '취소했는데 환불 금액이 안내와 달라요',
        receivedAt: new Date('2026-11-01T10:00:00+09:00'),
      });
      const [row] = await tx.select().from(disputes).where(eq(disputes.id, saved.id));
      expect(row).toMatchObject({
        reservationId: reservation.id,
        type: 'refund_exception',
        content: '취소했는데 환불 금액이 안내와 달라요',
        status: 'open',
        channel: 'app',
        receivedAt: new Date('2026-11-01T10:00:00+09:00'),
        registeredBy: null,
        outcome: null,
        result: null,
        handledBy: null,
        handledAt: null,
      });
      expect(row.createdAt).toEqual(saved.createdAt);

      const target = await readDisputeTarget(db, {
        reservationId: reservation.id,
        customerId: me.customerId,
      });
      expect(target).toMatchObject({
        status: 'cancelled',
        cancelledAt: new Date('2026-10-31T09:00:00+09:00'),
        dispute: { type: 'refund_exception', status: 'open', createdAt: saved.createdAt },
      });
    });
  });
});
