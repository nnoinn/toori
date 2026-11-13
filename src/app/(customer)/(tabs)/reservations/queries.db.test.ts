// 내 예약 조회가 본인 예약만, 탭별로, 순서대로 돌려주는지 실제 DB로 본다(X-102, C-501·C-502).
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { afterAll, expect, it } from 'vitest';

import { agreedCancelRequests, refunds } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  TEST_LOCATION,
} from '../../../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../../../tests/db/test-db';
import { selectMyReservationDetail, selectMyReservations } from './queries';

afterAll(closeTestDb);

/** 테스트 예약(11/1)은 모두 시작 전 */
const NOW = new Date('2026-10-31T09:00:00+09:00');

describeDb('내 예약 조회', () => {
  it('본인 예약만, 탭별로, 예정은 가까운 순', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const other = await createTestCustomer(tx);

      await createTestReservation(tx, shop, me.customerId, '15:00', '16:00', 'confirmed');
      await createTestReservation(tx, shop, me.customerId, '11:00', '12:00', 'confirmed');
      await createTestReservation(tx, shop, me.customerId, '09:00', '10:00', 'completed', {
        visitResult: 'no_show',
      });
      await createTestReservation(tx, shop, other.customerId, '13:00', '14:00', 'confirmed');

      const upcoming = await selectMyReservations(tx, me.customerId, 'upcoming', NOW);
      expect(upcoming.map((item) => new Date(item.startAt).getUTCHours())).toEqual([2, 6]); // 11시, 15시(한국)
      // 카드의 "~ 끝 시각"(#359 2번): 12시, 16시(한국)
      expect(upcoming.map((item) => new Date(item.endAt).getUTCHours())).toEqual([3, 7]);
      expect(upcoming.every((item) => !item.noShow)).toBe(true);

      const completed = await selectMyReservations(tx, me.customerId, 'completed', NOW);
      expect(completed).toHaveLength(1);
      expect(completed[0].noShow).toBe(true);

      expect(await selectMyReservations(tx, me.customerId, 'cancelled', NOW)).toEqual([]);
    });
  });

  it('합의 후 취소 요청 뱃지: 가장 최근 요청이 답 기한 전이면 붙고, 거절·만료면 없다(#359 3번)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const request = (
        reservationId: string,
        status: 'requested' | 'declined',
        requestedAt: string,
        expiresAt: string,
      ) =>
        tx.insert(agreedCancelRequests).values({
          reservationId,
          requestedBy: shop.createdBy,
          reason: 'style_mismatch',
          status,
          requestedAt: new Date(requestedAt),
          expiresAt: new Date(expiresAt),
          respondedAt: status === 'declined' ? new Date(requestedAt) : null,
        });

      const pending = await createTestReservation(
        tx,
        shop,
        me.customerId,
        '10:00',
        '11:00',
        'confirmed',
      );
      const expired = await createTestReservation(
        tx,
        shop,
        me.customerId,
        '12:00',
        '13:00',
        'confirmed',
      );
      const declinedThenAgain = await createTestReservation(
        tx,
        shop,
        me.customerId,
        '14:00',
        '15:00',
        'confirmed',
      );
      const declined = await createTestReservation(
        tx,
        shop,
        me.customerId,
        '16:00',
        '17:00',
        'confirmed',
      );
      // 지금(10/31 09:00) 기준: 답 기한 전 / 답 기한 지남(상태는 아직 requested)
      await request(
        pending.reservation.id,
        'requested',
        '2026-10-31T08:00:00+09:00',
        '2026-11-01T08:00:00+09:00',
      );
      await request(
        expired.reservation.id,
        'requested',
        '2026-10-30T08:00:00+09:00',
        '2026-10-31T08:00:00+09:00',
      );
      // 거절한 뒤 원장님이 다시 요청 → 가장 최근 요청으로 본다
      await request(
        declinedThenAgain.reservation.id,
        'declined',
        '2026-10-30T08:00:00+09:00',
        '2026-10-31T08:00:00+09:00',
      );
      await request(
        declinedThenAgain.reservation.id,
        'requested',
        '2026-10-31T08:30:00+09:00',
        '2026-11-01T08:30:00+09:00',
      );
      await request(
        declined.reservation.id,
        'declined',
        '2026-10-31T08:00:00+09:00',
        '2026-11-01T08:00:00+09:00',
      );

      const upcoming = await selectMyReservations(tx, me.customerId, 'upcoming', NOW);
      expect(upcoming.map((item) => item.agreedCancelPending)).toEqual([true, false, true, false]);
    });
  });

  it('취소 진행 중(requested)인 기록은 환불 내역으로 보이지 않는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const { reservation, order } = await createTestReservation(
        tx,
        shop,
        me.customerId,
        '17:00',
        '18:00',
        'confirmed',
      );
      await tx.insert(refunds).values({
        orderId: order.id,
        reservationId: reservation.id,
        reason: 'customer_cancel',
        status: 'requested',
        band: 'over_24h',
        penaltyRate: 30,
        refundAmount: 9800,
        penaltyAmount: 4200,
      });

      const mine = await selectMyReservationDetail(tx, me.customerId, reservation.id);
      expect(mine?.status).toBe('confirmed');
      expect(mine?.refund).toBeNull();
    });
  });

  it('상세는 본인 예약만 열리고, 취소면 환불 내역이 함께 온다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const other = await createTestCustomer(tx);

      const { reservation, order } = await createTestReservation(
        tx,
        shop,
        me.customerId,
        '15:00',
        '16:00',
        'cancelled',
        { cancelledAt: new Date('2026-10-31T10:00:00+09:00'), cancelActor: 'customer' },
      );
      await tx.insert(refunds).values({
        orderId: order.id,
        reservationId: reservation.id,
        reason: 'customer_cancel',
        band: 'over_24h',
        penaltyRate: 30,
        refundAmount: 9800,
        penaltyAmount: 4200,
        processedAt: new Date('2026-10-31T10:01:00+09:00'),
      });

      const mine = await selectMyReservationDetail(tx, me.customerId, reservation.id);
      expect(mine?.status).toBe('cancelled');
      expect(mine?.refund).toMatchObject({
        refundAmount: 9800,
        penaltyAmount: 4200,
        penaltyRate: 30,
      });
      expect(mine?.payment.amount).toBe(14000);
      // 예약 완료 화면(C-405)의 작은 지도에 쓰는 샵 위치
      expect(mine?.shop.shopId).toBe(shop.shopId);
      expect(mine?.shop.lat).toBeCloseTo(TEST_LOCATION.lat, 6);
      expect(mine?.shop.lng).toBeCloseTo(TEST_LOCATION.lng, 6);

      expect(await selectMyReservationDetail(tx, other.customerId, reservation.id)).toBeNull();
    });
  });
});
