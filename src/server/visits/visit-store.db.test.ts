// 방문·노쇼 처리 저장(recordVisitInTx)을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 동시에 두 번 처리하는 경우는 visit-concurrency.db.test.ts가 본다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { type VisitResult, reservations, slots } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import { recordVisitInTx } from './visit-store';

// 매물은 한국 시간 11/1 10:00~11:00(fixtures의 testSlot 날짜)
const START = new Date('2026-11-01T10:00:00+09:00');
const NOW = new Date('2026-11-01T12:00:00+09:00');

async function reservationOf(tx: TestTx, reservationId: string) {
  const [row] = await tx.select().from(reservations).where(eq(reservations.id, reservationId));
  const [slot] = await tx.select().from(slots).where(eq(slots.id, row.slotId));
  return { reservation: row, slot };
}

/** 승인 샵의 예약됨 예약 한 건(10:00~11:00) */
async function confirmedReservation(tx: TestTx) {
  const shop = await createTestShop(tx, { status: 'approved' });
  const { customerId } = await createTestCustomer(tx);
  const made = await createTestReservation(tx, shop, customerId, '10:00', '11:00', 'confirmed');
  return { shop, customerId, reservationId: made.reservation.id };
}

const record = (
  tx: TestTx,
  shop: { shopId: string; createdBy: string },
  reservationId: string,
  result: VisitResult,
  now = NOW,
) =>
  recordVisitInTx(tx, {
    shopId: shop.shopId,
    reservationId,
    result,
    recordedBy: shop.createdBy,
    now,
  });

describeDb('방문·노쇼 처리 저장 (실제 DB)', () => {
  afterAll(closeTestDb);

  it.each(['visited', 'no_show'] as const)(
    '%s: 예약은 이용 완료 + 결과·처리 시각·처리한 원장님, 매물은 완료로 한 번에 바꾼다',
    async (result) => {
      await withRollback(async (tx) => {
        const { shop, reservationId } = await confirmedReservation(tx);

        expect(await record(tx, shop, reservationId, result)).toEqual({
          ok: true,
          data: { reservationId, visitResult: result, recordedAt: NOW.toISOString() },
        });
        const { reservation, slot } = await reservationOf(tx, reservationId);
        expect(reservation).toMatchObject({
          status: 'completed',
          visitResult: result,
          visitRecordedAt: NOW,
          visitRecordedBy: shop.createdBy,
        });
        expect(slot.status).toBe('completed');
      });
    },
  );

  it('딱 시작 시각이면 처리하고, 1ms 전이면 TOO_EARLY로 아무것도 바꾸지 않는다', async () => {
    await withRollback(async (tx) => {
      const { shop, reservationId } = await confirmedReservation(tx);

      const early = await record(tx, shop, reservationId, 'visited', new Date(START.getTime() - 1));
      expect(early.ok ? null : early.error.code).toBe('TOO_EARLY');
      let { reservation, slot } = await reservationOf(tx, reservationId);
      expect(reservation).toMatchObject({ status: 'confirmed', visitResult: null });
      expect(slot.status).toBe('reserved');

      expect((await record(tx, shop, reservationId, 'visited', START)).ok).toBe(true);
      ({ reservation, slot } = await reservationOf(tx, reservationId));
      expect(reservation.status).toBe('completed');
      expect(slot.status).toBe('completed');
    });
  });

  it('두 번째 처리는 ALREADY_RECORDED이고 처음 결과가 그대로 남는다', async () => {
    await withRollback(async (tx) => {
      const { shop, reservationId } = await confirmedReservation(tx);
      expect((await record(tx, shop, reservationId, 'visited')).ok).toBe(true);

      const later = new Date(NOW.getTime() + 60_000);
      const second = await record(tx, shop, reservationId, 'no_show', later);
      expect(second.ok ? null : second.error.code).toBe('ALREADY_RECORDED');
      const { reservation } = await reservationOf(tx, reservationId);
      expect(reservation).toMatchObject({ visitResult: 'visited', visitRecordedAt: NOW });
    });
  });

  it('다른 샵의 예약이나 없는 예약은 RESERVATION_NOT_FOUND이고 바꾸지 않는다', async () => {
    await withRollback(async (tx) => {
      const { reservationId } = await confirmedReservation(tx);
      const otherShop = await createTestShop(tx, { status: 'approved' });

      const other = await record(tx, otherShop, reservationId, 'no_show');
      expect(other.ok ? null : other.error.code).toBe('RESERVATION_NOT_FOUND');
      const missing = await record(tx, otherShop, crypto.randomUUID(), 'no_show');
      expect(missing.ok ? null : missing.error.code).toBe('RESERVATION_NOT_FOUND');
      const { reservation, slot } = await reservationOf(tx, reservationId);
      expect(reservation).toMatchObject({ status: 'confirmed', visitResult: null });
      expect(slot.status).toBe('reserved');
    });
  });

  it('취소된 예약은 NOT_RESERVED이고 바꾸지 않는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const made = await createTestReservation(tx, shop, customerId, '10:00', '11:00', 'cancelled');

      const result = await record(tx, shop, made.reservation.id, 'no_show');
      expect(result.ok ? null : result.error.code).toBe('NOT_RESERVED');
      const { reservation, slot } = await reservationOf(tx, made.reservation.id);
      expect(reservation).toMatchObject({ status: 'cancelled', visitResult: null });
      expect(slot.status).toBe('cancelled');
    });
  });
});
