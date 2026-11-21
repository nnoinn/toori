// 운영자 샵 상세의 '취소 기록'(샵별 원장님 귀책 취소·합의 후 취소)을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 그 샵 것만 세는지, 원장님 귀책만 세는지(고객 취소는 빼는지), 결과별·사유별 수, 최근 순서와 패널티 남은 금액을 본다.
// 합의 후 취소 요청은 저장된 상태가 아니라 지금 상태(답 기한이 지났으면 만료, 예약이 바뀌었으면 끝남)로 보이고 세는지도 본다.

import { afterAll, expect, it } from 'vitest';

import { agreedCancelRequests, ownerPenalties } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  type TestShop,
} from '../../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../../tests/db/test-db';
import { toCancelStatsRange } from './cancel-stats-period';
import { selectShopCancelStats } from './cancel-stats-queries';

const at = (day: number, hm: string) =>
  new Date(`2026-10-${String(day).padStart(2, '0')}T${hm}:00+09:00`);
const HOUR_MS = 60 * 60 * 1000;
/** 화면을 연 시각 */
const NOW = at(31, '12:00');

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

/**
 * 지금 상태 테스트 데이터(화면을 연 시각 NOW = 10/31 12:00). 한 샵의 합의 후 취소 요청 4개:
 * - waiting: 저장 답 기다림, 답 기한 11/1 10:00 → 답 기다림
 * - changed: 저장 답 기다림, 손님이 답하기 전에 고객이 예약을 취소함(정리 작업이 닫기 전) → 끝남
 * - expired: 저장 답 기다림, 답 기한이 NOW와 같음(그 시각부터 답할 수 없다) → 만료
 * - storedExpired: 정리 작업이 이미 만료로 바꾼 요청 → 만료
 */
async function seedWaitingRequests(tx: TestTx) {
  const shop = await createTestShop(tx, { status: 'approved' });
  const { customerId } = await createTestCustomer(tx);
  const request = (reservationId: string, status: 'requested' | 'expired', requestedAt: Date) => ({
    reservationId,
    requestedBy: shop.createdBy,
    reason: 'style_mismatch' as const,
    status,
    requestedAt,
    expiresAt: new Date(requestedAt.getTime() + 24 * HOUR_MS),
    respondedAt: status === 'requested' ? null : new Date(requestedAt.getTime() + 24 * HOUR_MS),
  });
  const booked = (start: string, end: string) =>
    createTestReservation(tx, shop, customerId, start, end, 'confirmed');
  const waiting = await booked('09:00', '10:00');
  const expired = await booked('10:00', '11:00');
  const storedExpired = await booked('11:00', '12:00');
  const changed = await createTestReservation(tx, shop, customerId, '12:00', '13:00', 'cancelled', {
    cancelActor: 'customer',
    cancelledAt: at(31, '11:00'),
  });
  const [waitingRow, changedRow, expiredRow, storedExpiredRow] = await tx
    .insert(agreedCancelRequests)
    .values([
      request(waiting.reservation.id, 'requested', at(31, '10:00')),
      request(changed.reservation.id, 'requested', at(31, '09:00')),
      request(expired.reservation.id, 'requested', at(30, '12:00')),
      request(storedExpired.reservation.id, 'expired', at(29, '10:00')),
    ])
    .returning({ id: agreedCancelRequests.id });
  return {
    shopId: shop.shopId,
    ids: {
      waiting: waitingRow.id,
      changed: changedRow.id,
      expired: expiredRow.id,
      storedExpired: storedExpiredRow.id,
    },
  };
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

      const stats = await selectShopCancelStats(tx, shop.shopId, NOW);
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
      expect(await selectShopCancelStats(tx, empty.shopId, NOW)).toEqual({
        ownerFault: { count: 0, recent: [] },
        agreed: {
          byStatus: { requested: 0, agreed: 0, declined: 0, expired: 0, closed: 0 },
          agreedByReason: { style_mismatch: 0, customer_declined: 0, other: 0 },
          recent: [],
        },
      });
    });
  });
  it('기간을 고르면(#486) 원장님 사정 취소는 취소한 시각, 합의 후 취소는 요청한 시각이 그 안인 것만 센다. 시작일 0시는 넣고 끝일은 하루를 다 넣는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const nov1 = new Date('2026-11-01T00:00:00+09:00');

      // 10/30~10/31을 고른다: 10/29 23:59와 11/1 0시는 빠지고, 10/30 0시와 10/31 23:59는 들어간다
      await ownerFault(tx, shop, customerId, '09:00', '10:00', at(29, '23:59'), 30);
      const first = await ownerFault(tx, shop, customerId, '10:00', '11:00', at(30, '00:00'), 20);
      const last = await ownerFault(tx, shop, customerId, '11:00', '12:00', at(31, '23:59'), 10);
      await ownerFault(tx, shop, customerId, '12:00', '13:00', nov1, 5);

      const booked = (start: string, end: string) =>
        createTestReservation(tx, shop, customerId, start, end, 'confirmed');
      const request = (
        reservationId: string,
        status: 'agreed' | 'declined',
        requestedAt: Date,
      ) => ({
        reservationId,
        requestedBy: shop.createdBy,
        reason: 'style_mismatch' as const,
        status,
        requestedAt,
        expiresAt: new Date(requestedAt.getTime() + 24 * HOUR_MS),
        respondedAt: new Date(requestedAt.getTime() + HOUR_MS),
      });
      const a = await booked('14:00', '15:00');
      const b = await booked('15:00', '16:00');
      const c = await booked('16:00', '17:00');
      const d = await booked('17:00', '18:00');
      const [, inFirst, inLast] = await tx
        .insert(agreedCancelRequests)
        .values([
          request(a.reservation.id, 'agreed', at(29, '23:59')),
          request(b.reservation.id, 'agreed', at(30, '00:00')),
          request(c.reservation.id, 'declined', at(31, '23:59')),
          request(d.reservation.id, 'agreed', nov1),
        ])
        .returning({ id: agreedCancelRequests.id });

      const range = toCancelStatsRange({ from: '2026-10-30', to: '2026-10-31' });
      expect(range).not.toBeNull();
      if (!range) return;
      const stats = await selectShopCancelStats(tx, shop.shopId, NOW, range);
      expect(stats.ownerFault.count).toBe(2);
      expect(stats.ownerFault.recent.map((row) => row.reservationId)).toEqual([
        last.reservation.id,
        first.reservation.id,
      ]);
      expect(stats.agreed.byStatus).toEqual({
        requested: 0,
        agreed: 1,
        declined: 1,
        expired: 0,
        closed: 0,
      });
      expect(stats.agreed.agreedByReason).toEqual({
        style_mismatch: 1,
        customer_declined: 0,
        other: 0,
      });
      expect(stats.agreed.recent.map((row) => row.requestId)).toEqual([inLast.id, inFirst.id]);

      // 시작일만·끝일만 고를 수도 있고, 기간이 없으면 전체 기간이다
      const fromOnly = toCancelStatsRange({ from: '2026-10-31' });
      const toOnly = toCancelStatsRange({ to: '2026-10-29' });
      if (!fromOnly || !toOnly) return;
      expect((await selectShopCancelStats(tx, shop.shopId, NOW, fromOnly)).ownerFault.count).toBe(
        2,
      );
      expect((await selectShopCancelStats(tx, shop.shopId, NOW, toOnly)).ownerFault.count).toBe(1);
      const all = await selectShopCancelStats(tx, shop.shopId, NOW);
      expect(all.ownerFault.count).toBe(4);
      expect(all.agreed.byStatus.agreed + all.agreed.byStatus.declined).toBe(4);
    });
  });

  it('최근 요청 목록: 저장된 상태가 답 기다림이어도 답 기한이 지났으면 만료, 손님이 답하기 전에 예약이 바뀌었으면 끝남으로 보인다', async () => {
    await withRollback(async (tx) => {
      const { shopId, ids } = await seedWaitingRequests(tx);
      const stats = await selectShopCancelStats(tx, shopId, NOW);
      expect(stats.agreed.recent.map((row) => [row.requestId, row.status])).toEqual([
        [ids.waiting, 'requested'],
        [ids.changed, 'closed'],
        [ids.expired, 'expired'],
        [ids.storedExpired, 'expired'],
      ]);
    });
  });

  it('결과별 수: 저장된 상태가 답 기다림인 요청도 지금 상태(답 기다림·만료·끝남)로 센다', async () => {
    await withRollback(async (tx) => {
      const { shopId } = await seedWaitingRequests(tx);
      const stats = await selectShopCancelStats(tx, shopId, NOW);
      expect(stats.agreed.byStatus).toEqual({
        requested: 1,
        agreed: 0,
        declined: 0,
        expired: 2,
        closed: 1,
      });
      // 1분 전에 열었으면 기한이 남아 있던 요청은 아직 답 기다림이다
      const earlier = await selectShopCancelStats(tx, shopId, new Date(NOW.getTime() - 60_000));
      expect(earlier.agreed.byStatus).toMatchObject({ requested: 2, expired: 1, closed: 1 });
    });
  });
});
