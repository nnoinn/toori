// 합의 후 취소의 예약 값 읽기와 요청 저장·만료·거절·정리를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다 (#301, #320).

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { agreedCancelRequests, orders, reservations } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../tests/db/test-db';
import {
  closeChangedRequests,
  declineAgreedCancelRequest,
  expireDueRequests,
  expireReservationRequests,
  insertAgreedCancelRequest,
  readAgreedCancelRequest,
  readAgreedCancelTarget,
  readLatestAgreedCancelRequest,
} from './agreed-cancel-store';

type Db = Parameters<typeof readAgreedCancelTarget>[0] &
  Parameters<typeof expireDueRequests>[0] &
  Parameters<typeof closeChangedRequests>[0];

const NOW = new Date('2026-11-12T12:00:00+09:00');
const HOUR = 60 * 60 * 1000;

describeDb('합의 후 취소 예약 값 읽기 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('예약의 고객·샵·상태·시작과 주문의 판매가·결제액·쿠폰을 읽고, 없는 예약은 null', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const { reservation, slot, order } = await createTestReservation(
        tx,
        shop,
        customerId,
        '09:00',
        '10:00',
        'confirmed',
      );
      // 쿠폰을 쓴 주문처럼 결제액을 바꿔 둔다(판매가 14,000 − 쿠폰 3,000)
      await tx
        .update(orders)
        .set({ couponAmount: 3000, amount: 11_000 })
        .where(eq(orders.id, order.id));

      expect(await readAgreedCancelTarget(db, reservation.id)).toEqual({
        reservationId: reservation.id,
        customerId,
        shopId: shop.shopId,
        status: 'confirmed',
        visitResult: null,
        startAt: slot.startAt,
        salePrice: 14_000,
        paidAmount: 11_000,
        couponAmount: 3000,
      });
      expect(await readAgreedCancelTarget(db, crypto.randomUUID())).toBeNull();
    });
  });

  it('요청 저장·가장 최근 요청, 답 기다리는 요청은 하나, 지난 요청은 만료로 바꾼 뒤 다시 요청', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const { reservation } = await createTestReservation(
        tx,
        shop,
        customerId,
        '09:00',
        '10:00',
        'confirmed',
      );
      const base = {
        reservationId: reservation.id,
        requestedBy: shop.createdBy,
        reason: 'style_mismatch' as const,
        reasonText: null,
      };
      const first = await insertAgreedCancelRequest(db, {
        ...base,
        requestedAt: new Date(NOW.getTime() - 25 * HOUR),
        expiresAt: new Date(NOW.getTime() - HOUR),
      });
      // 아직 '답 기다림'이라 새 요청은 unique가 막는다
      await expect(
        tx.transaction((t) =>
          insertAgreedCancelRequest(t as unknown as Db, {
            ...base,
            requestedAt: NOW,
            expiresAt: new Date(NOW.getTime() + 24 * HOUR),
          }),
        ),
      ).rejects.toThrow();

      await expireReservationRequests(db, { reservationId: reservation.id, now: NOW });
      const second = await insertAgreedCancelRequest(db, {
        ...base,
        reason: 'other',
        reasonText: '손님이 다음에 오기로 했어요',
        requestedAt: NOW,
        expiresAt: new Date(NOW.getTime() + 24 * HOUR),
      });

      const [old] = await tx
        .select()
        .from(agreedCancelRequests)
        .where(eq(agreedCancelRequests.id, first.requestId));
      expect(old).toMatchObject({ status: 'expired', respondedAt: new Date(NOW.getTime() - HOUR) });
      expect(await readLatestAgreedCancelRequest(db, reservation.id)).toMatchObject({
        requestId: second.requestId,
        reason: 'other',
        reasonText: '손님이 다음에 오기로 했어요',
        status: 'requested',
        respondedAt: null,
      });
      expect(await readAgreedCancelRequest(db, second.requestId)).toMatchObject({
        request: { requestId: second.requestId, reservationId: reservation.id },
        target: { reservationId: reservation.id, customerId, status: 'confirmed' },
      });
    });
  });

  it('거절은 답 기다림·만료 전·예정 예약일 때만 한 번', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const { reservation } = await createTestReservation(
        tx,
        shop,
        customerId,
        '09:00',
        '10:00',
        'confirmed',
      );
      const { requestId } = await insertAgreedCancelRequest(db, {
        reservationId: reservation.id,
        requestedBy: shop.createdBy,
        reason: 'customer_declined',
        reasonText: null,
        requestedAt: NOW,
        expiresAt: new Date(NOW.getTime() + 24 * HOUR),
      });
      // 만료 시각 뒤에는 바뀌지 않는다
      expect(
        await declineAgreedCancelRequest(db, {
          requestId,
          now: new Date(NOW.getTime() + 24 * HOUR),
        }),
      ).toBe(false);
      expect(await declineAgreedCancelRequest(db, { requestId, now: NOW })).toBe(true);
      expect(await declineAgreedCancelRequest(db, { requestId, now: NOW })).toBe(false);
      expect(await readLatestAgreedCancelRequest(db, reservation.id)).toMatchObject({
        status: 'declined',
        respondedAt: NOW,
      });
    });
  });

  it('정리 작업: 만료 시각이 지난 요청은 만료로(바꾼 요청을 돌려준다), 예약이 바뀐 요청은 끝남으로', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const expiring = await createTestReservation(
        tx,
        shop,
        customerId,
        '09:00',
        '10:00',
        'confirmed',
      );
      const changed = await createTestReservation(
        tx,
        shop,
        customerId,
        '11:00',
        '12:00',
        'confirmed',
      );
      const due = await insertAgreedCancelRequest(db, {
        reservationId: expiring.reservation.id,
        requestedBy: shop.createdBy,
        reason: 'style_mismatch',
        reasonText: null,
        requestedAt: new Date(NOW.getTime() - 24 * HOUR),
        expiresAt: NOW,
      });
      const live = await insertAgreedCancelRequest(db, {
        reservationId: changed.reservation.id,
        requestedBy: shop.createdBy,
        reason: 'style_mismatch',
        reasonText: null,
        requestedAt: NOW,
        expiresAt: new Date(NOW.getTime() + 24 * HOUR),
      });
      await tx
        .update(reservations)
        .set({ status: 'cancelled', cancelActor: 'customer', cancelledAt: NOW })
        .where(eq(reservations.id, changed.reservation.id));

      const expired = await expireDueRequests(db, { now: NOW, limit: 200 });
      expect(expired).toContainEqual({
        requestId: due.requestId,
        reservationId: expiring.reservation.id,
      });
      expect(expired.map((item) => item.requestId)).not.toContain(live.requestId);
      expect(await closeChangedRequests(db, { now: NOW })).toBeGreaterThanOrEqual(1);
      expect(await readLatestAgreedCancelRequest(db, changed.reservation.id)).toMatchObject({
        status: 'closed',
        respondedAt: NOW,
      });
      expect(await readLatestAgreedCancelRequest(db, expiring.reservation.id)).toMatchObject({
        status: 'expired',
        respondedAt: NOW,
      });
    });
  });
});
