// 운영자의 노쇼 되돌리기(#373 ③, 11/16)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 대신 방문·노쇼 처리는 원장님과 같은 recordVisitInTx라 visit-store.db.test.ts가 본다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { adminActions, disputes, reservations, settlementItems, settlements } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  createTestUser,
  type TestShop,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import { readReservationShopId, reverseNoShowInTx } from './admin-visit-store';

const RECORDED_AT = new Date('2026-11-01T11:00:00+09:00');

async function noShow(tx: TestTx, shop: TestShop, start: string, end: string) {
  const { customerId } = await createTestCustomer(tx);
  return createTestReservation(tx, shop, customerId, start, end, 'completed', {
    visitResult: 'no_show',
    visitRecordedAt: RECORDED_AT,
  });
}

async function readVisit(tx: TestTx, reservationId: string) {
  const [row] = await tx
    .select({
      visitResult: reservations.visitResult,
      visitRecordedAt: reservations.visitRecordedAt,
    })
    .from(reservations)
    .where(eq(reservations.id, reservationId));
  return row;
}

async function actionsOn(tx: TestTx, reservationId: string) {
  return tx
    .select({
      adminId: adminActions.adminId,
      action: adminActions.action,
      targetType: adminActions.targetType,
      memo: adminActions.memo,
    })
    .from(adminActions)
    .where(eq(adminActions.targetId, reservationId));
}

describeDb('운영자 노쇼 되돌리기 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('노쇼를 방문으로 바꾸고, 같은 트랜잭션에서 visit.override 기록(사유)을 남긴다. 처리 시각은 그대로다', async () => {
    await withRollback(async (tx) => {
      const adminId = await createTestUser(tx);
      const shop = await createTestShop(tx, { status: 'approved' });
      const made = await noShow(tx, shop, '09:00', '10:00');

      expect(await readReservationShopId(tx, made.reservation.id)).toBe(shop.shopId);
      expect(await readReservationShopId(tx, crypto.randomUUID())).toBeNull();

      const result = await reverseNoShowInTx(tx, {
        reservationId: made.reservation.id,
        adminId,
        reason: '원장님이 잘못 눌렀다고 전화함',
      });
      expect(result).toEqual({ ok: true, data: { reservationId: made.reservation.id } });
      expect(await readVisit(tx, made.reservation.id)).toEqual({
        visitResult: 'visited',
        visitRecordedAt: RECORDED_AT,
      });
      expect(await actionsOn(tx, made.reservation.id)).toEqual([
        {
          adminId,
          action: 'visit.override',
          targetType: 'reservation',
          memo: '원장님이 잘못 눌렀다고 전화함',
        },
      ]);

      // 두 번째는 노쇼가 아니라서 막히고 기록도 늘지 않는다
      expect(
        await reverseNoShowInTx(tx, {
          reservationId: made.reservation.id,
          adminId,
          reason: '다시',
        }),
      ).toMatchObject({ ok: false, error: { code: 'NOT_NO_SHOW' } });
      expect(await actionsOn(tx, made.reservation.id)).toHaveLength(1);
    });
  });

  it('없는 예약·방문 완료 예약·확인 중인 이의제기·정산에 묶인 예약은 막고 아무것도 바꾸지 않는다', async () => {
    await withRollback(async (tx) => {
      const adminId = await createTestUser(tx);
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const visited = await createTestReservation(
        tx,
        shop,
        customerId,
        '09:00',
        '10:00',
        'completed',
        {
          visitResult: 'visited',
          visitRecordedAt: RECORDED_AT,
        },
      );
      const disputed = await noShow(tx, shop, '10:00', '11:00');
      const bundled = await noShow(tx, shop, '11:00', '12:00');
      const resolved = await noShow(tx, shop, '12:00', '13:00');

      await tx.insert(disputes).values([
        {
          reservationId: disputed.reservation.id,
          type: 'no_show',
          content: '방문했는데 노쇼래요',
          status: 'open',
          channel: 'app',
          receivedAt: RECORDED_AT,
        },
        {
          reservationId: resolved.reservation.id,
          type: 'no_show',
          content: '이미 결론 난 이의제기',
          status: 'resolved',
          outcome: 'no_show_confirmed',
          channel: 'app',
          receivedAt: RECORDED_AT,
          handledAt: RECORDED_AT,
        },
      ]);
      const [settlement] = await tx
        .insert(settlements)
        .values({
          shopId: shop.shopId,
          periodStart: '2026-10-30',
          periodEnd: '2026-11-05',
          itemCount: 1,
          totalBaseAmount: 14_000,
          totalFeeAmount: 0,
          penaltyDeducted: 0,
          payoutAmount: 13_538,
          status: 'pending',
        })
        .returning();
      await tx.insert(settlementItems).values({
        shopId: shop.shopId,
        orderId: bundled.order.id,
        kind: 'no_show',
        baseAmount: 14_000,
        feeRate: 0,
        feeAmount: 0,
        feeVat: 0,
        paymentFeeRate: 3.3,
        paymentFee: 420,
        paymentFeeVat: 42,
        payoutAmount: 13_538,
        pgFeeActual: null,
        settlementId: settlement.id,
      });

      const reverse = (reservationId: string) =>
        reverseNoShowInTx(tx, { reservationId, adminId, reason: '확인' });
      expect(await reverse(crypto.randomUUID())).toMatchObject({
        error: { code: 'RESERVATION_NOT_FOUND' },
      });
      expect(await reverse(visited.reservation.id)).toMatchObject({
        error: { code: 'NOT_NO_SHOW' },
      });
      expect(await reverse(disputed.reservation.id)).toMatchObject({
        error: { code: 'DISPUTE_OPEN' },
      });
      expect(await reverse(bundled.reservation.id)).toMatchObject({
        error: { code: 'SETTLEMENT_BUNDLED' },
      });
      for (const made of [disputed, bundled]) {
        expect((await readVisit(tx, made.reservation.id)).visitResult).toBe('no_show');
        expect(await actionsOn(tx, made.reservation.id)).toEqual([]);
      }

      // 결론이 난 이의제기는 막지 않는다
      expect(await reverse(resolved.reservation.id)).toMatchObject({ ok: true });
    });
  });
});
