// 운영자 샵 상세의 '취소 기록'(샵별 원장님 귀책 취소·합의 후 취소)을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 그 샵 것만 세는지, 원장님 귀책만 세는지(고객 취소는 빼는지), 결과별·사유별 수, 최근 순서와 패널티 남은 금액을 본다.

import { afterAll, expect, it } from 'vitest';

import { agreedCancelRequests, ownerPenalties } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  type TestShop,
} from '../../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../../tests/db/test-db';
import { selectShopCancelStats } from './cancel-stats-queries';

const at = (day: number, hm: string) =>
  new Date(`2026-10-${String(day).padStart(2, '0')}T${hm}:00+09:00`);
const HOUR_MS = 60 * 60 * 1000;

async function ownerFault(
  tx: TestTx,
  shop: TestShop,
  customerId: string,
  start: string,
  end: string,
  cancelledAt: Date,
  hoursBeforeStart: number,
) {
  return createTestReservation(tx, shop, customerId, start, end, 'cancelled', {
    cancelActor: 'owner_fault',
    cancelledAt,
    hoursBeforeStartAtCancel: hoursBeforeStart,
  });
}

describeDb('운영자 샵 취소 기록 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('그 샵의 원장님 사정 취소(최근 순, 패널티 남은 금액)와 합의 후 취소 요청(결과별·동의 사유별, 최근 순)만 센다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const other = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);

      const older = await ownerFault(tx, shop, customerId, '09:00', '10:00', at(30, '10:00'), 23);
      const newer = await ownerFault(tx, shop, customerId, '10:00', '11:00', at(31, '10:00'), 3);
      await tx.insert(ownerPenalties).values([
        {
          shopId: shop.shopId,
          reservationId: older.reservation.id,
          amount: 5_000,
          collectedAmount: 5_000,
        },
        {
          shopId: shop.shopId,
          reservationId: newer.reservation.id,
          amount: 5_000,
          collectedAmount: 2_000,
        },
      ]);
      // 고객 취소와 다른 샵의 원장님 귀책 취소는 세지 않는다
      await createTestReservation(tx, shop, customerId, '11:00', '12:00', 'cancelled', {
        cancelActor: 'customer',
        cancelledAt: at(31, '11:00'),
      });
      await ownerFault(tx, other, customerId, '09:00', '10:00', at(31, '12:00'), 5);

      const booked = (start: string, end: string, target = shop) =>
        createTestReservation(tx, target, customerId, start, end, 'confirmed');
      const request = (
        reservationId: string,
        status: 'requested' | 'agreed' | 'declined' | 'expired',
        reason: 'style_mismatch' | 'customer_declined' | 'other',
        requestedAt: Date,
        reasonText: string | null = null,
      ) => ({
        reservationId,
        requestedBy: shop.createdBy,
        reason,
        reasonText,
        status,
        requestedAt,
        expiresAt: new Date(requestedAt.getTime() + 24 * HOUR_MS),
        respondedAt: status === 'requested' ? null : new Date(requestedAt.getTime() + HOUR_MS),
      });
      const a = await booked('13:00', '14:00');
      const b = await booked('14:00', '15:00');
      const c = await booked('15:00', '16:00');
      const d = await booked('16:00', '17:00');
      const elsewhere = await booked('13:00', '14:00', other);
      await tx
        .insert(agreedCancelRequests)
        .values([
          request(a.reservation.id, 'agreed', 'style_mismatch', at(28, '10:00')),
          request(b.reservation.id, 'agreed', 'style_mismatch', at(29, '10:00')),
          request(c.reservation.id, 'declined', 'customer_declined', at(30, '10:00')),
          request(c.reservation.id, 'agreed', 'other', at(30, '12:00'), '손님이 다른 날을 원함'),
          request(d.reservation.id, 'requested', 'customer_declined', at(31, '10:00')),
          request(elsewhere.reservation.id, 'expired', 'other', at(31, '11:00'), '다른 샵'),
        ]);

      const stats = await selectShopCancelStats(tx, shop.shopId);
      expect(stats.ownerFault.count).toBe(2);
      expect(stats.ownerFault.recent).toEqual([
        {
          reservationId: newer.reservation.id,
          reservationCode: newer.reservation.code,
          menuName: '커트',
          startAt: newer.slot.startAt,
          cancelledAt: at(31, '10:00'),
          hoursBeforeStart: 3,
          penalty: { amount: 5_000, remaining: 3_000 },
        },
        expect.objectContaining({
          reservationId: older.reservation.id,
          hoursBeforeStart: 23,
          penalty: { amount: 5_000, remaining: 0 },
        }),
      ]);

      expect(stats.agreed.byStatus).toEqual({
        requested: 1,
        agreed: 3,
        declined: 1,
        expired: 0,
        closed: 0,
      });
      expect(stats.agreed.agreedByReason).toEqual({
        style_mismatch: 2,
        customer_declined: 0,
        other: 1,
      });
      expect(stats.agreed.recent.map((row) => [row.reservationId, row.status])).toEqual([
        [d.reservation.id, 'requested'],
        [c.reservation.id, 'agreed'],
        [c.reservation.id, 'declined'],
        [b.reservation.id, 'agreed'],
        [a.reservation.id, 'agreed'],
      ]);
      expect(stats.agreed.recent[1]).toMatchObject({
        reason: 'other',
        reasonText: '손님이 다른 날을 원함',
        requestedAt: at(30, '12:00'),
      });

      const empty = await createTestShop(tx, { status: 'approved' });
      expect(await selectShopCancelStats(tx, empty.shopId)).toEqual({
        ownerFault: { count: 0, recent: [] },
        agreed: {
          byStatus: { requested: 0, agreed: 0, declined: 0, expired: 0, closed: 0 },
          agreedByReason: { style_mismatch: 0, customer_declined: 0, other: 0 },
          recent: [],
        },
      });
    });
  });
});
