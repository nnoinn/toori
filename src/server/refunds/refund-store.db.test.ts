// 예약 취소 DB 읽기(readRefundTarget)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다. 내 예약만 읽고, 결제액·판매가·쿠폰·시작 시각을 가져온다.

import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { orders, refunds } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../tests/db/test-db';
import { readRefundTarget } from './refund-store';

describeDb('예약 취소 DB 읽기 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('내 예약의 상태·결제액·판매가·쿠폰·시작 시각을 읽는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const { slot, order, reservation } = await createTestReservation(
        tx,
        shop,
        me.customerId,
        '10:00',
        '11:00',
        'confirmed',
      );
      expect(await readRefundTarget(reservation.id, me.customerId, tx)).toEqual({
        reservationId: reservation.id,
        status: 'confirmed',
        paidAmount: order.amount,
        salePrice: slot.salePrice,
        couponAmount: 0,
        startAt: slot.startAt,
      });

      await tx
        .update(orders)
        .set({ couponAmount: 3_000, amount: 11_000 })
        .where(eq(orders.id, order.id));
      expect(await readRefundTarget(reservation.id, me.customerId, tx)).toMatchObject({
        paidAmount: 11_000,
        salePrice: 14_000,
        couponAmount: 3_000,
      });
    });
  });

  it('남의 예약과 없는 예약은 null', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const other = await createTestCustomer(tx);
      const { reservation } = await createTestReservation(
        tx,
        shop,
        other.customerId,
        '10:00',
        '11:00',
        'confirmed',
      );
      expect(await readRefundTarget(reservation.id, me.customerId, tx)).toBeNull();
      expect(await readRefundTarget(crypto.randomUUID(), me.customerId, tx)).toBeNull();
    });
  });

  describe('환불 기록 제약 (#234)', () => {
    const NOW = new Date('2026-11-01T10:00:00+09:00');

    async function booked(tx: Parameters<Parameters<typeof withRollback>[0]>[0]) {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const { order, reservation } = await createTestReservation(
        tx,
        shop,
        me.customerId,
        '10:00',
        '11:00',
        'confirmed',
      );
      return {
        orderId: order.id,
        reservationId: reservation.id,
        penaltyRate: 30,
        refundAmount: 9_800,
        penaltyAmount: 4_200,
      };
    }

    it('한 예약에 고객 취소 기록은 하나만 넣을 수 있고, 다른 사유는 막지 않는다', async () => {
      await withRollback(async (tx) => {
        const row = await booked(tx);
        await tx.insert(refunds).values({ ...row, reason: 'customer_cancel', status: 'requested' });
        await expect(
          tx.transaction((sp) =>
            sp.insert(refunds).values({ ...row, reason: 'customer_cancel', processedAt: NOW }),
          ),
        ).rejects.toThrow();
        await tx.insert(refunds).values({ ...row, reason: 'admin_exception', processedAt: NOW });
      });
    });

    it('끝난(done) 기록에는 처리 시각이 있어야 하고, 진행 중(requested)에는 없어도 된다', async () => {
      await withRollback(async (tx) => {
        const row = await booked(tx);
        await expect(
          tx.transaction((sp) => sp.insert(refunds).values({ ...row, reason: 'customer_cancel' })),
        ).rejects.toThrow();
        const [requested] = await tx
          .insert(refunds)
          .values({ ...row, reason: 'customer_cancel', status: 'requested' })
          .returning();
        expect(requested.processedAt).toBeNull();
        expect(requested.createdAt).toBeInstanceOf(Date);
        expect(requested.reviewReason).toBeNull();
      });
    });

    it('상태를 적지 않으면 끝난(done) 기록이다(지금 코드와 맞다)', async () => {
      await withRollback(async (tx) => {
        const row = await booked(tx);
        const [saved] = await tx
          .insert(refunds)
          .values({ ...row, reason: 'auto_cancel', processedAt: NOW })
          .returning();
        expect(saved.status).toBe('done');
      });
    });
  });
});
