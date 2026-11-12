// 예약 취소 DB 읽기(readRefundTarget)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다. 내 예약만 읽고, 결제액·판매가·쿠폰·시작 시각을 가져온다.

import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { orders, refunds, reservations, slots } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../tests/db/test-db';
import {
  clearRequestedCancel,
  finishAdminCancel,
  finishCancelRecord,
  readRefundTarget,
  readRefundTargetByOrder,
  readStaleCancels,
  requestCancelRefund,
} from './refund-store';

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
        orderId: order.id,
        slotId: slot.id,
        paymentId: order.paymentId,
        status: 'confirmed',
        paidAmount: order.amount,
        salePrice: slot.salePrice,
        couponAmount: 0,
        startAt: slot.startAt,
        requested: null,
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

  it('readRefundTargetByOrder는 고객 없이 주문의 예약을 읽는다', async () => {
    await withRollback(async (tx) => {
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
      expect(await readRefundTargetByOrder(tx, order.id)).toEqual(
        await readRefundTarget(reservation.id, me.customerId, tx),
      );
      await tx.delete(reservations).where(eq(reservations.id, reservation.id));
      expect(await readRefundTargetByOrder(tx, order.id)).toBeNull();
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

  describe('고객 취소 저장', () => {
    const REQUESTED_AT = new Date('2026-11-01T10:00:00+09:00');
    const NOW = new Date('2026-11-01T10:20:00+09:00');
    const amounts = {
      reason: 'customer_cancel' as const,
      band: 'over_24h' as const,
      penaltyRate: 30,
      refundAmount: 9_800,
      penaltyAmount: 4_200,
    };

    async function booking(
      tx: Parameters<Parameters<typeof withRollback>[0]>[0],
      status: 'confirmed' | 'completed' = 'confirmed',
    ) {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const made = await createTestReservation(tx, shop, me.customerId, '10:00', '11:00', status);
      return {
        ...made,
        customerId: me.customerId,
        request: {
          reservationId: made.reservation.id,
          orderId: made.order.id,
          ...amounts,
          requestedAt: REQUESTED_AT,
        },
        finish: {
          reservationId: made.reservation.id,
          orderId: made.order.id,
          slotId: made.slot.id,
          ...amounts,
          pgCancellationId: 'c-1',
          reviewReason: null,
          hoursBeforeStart: 30.5,
          requestedAt: REQUESTED_AT,
          now: NOW,
        },
      };
    }
    const rowsOf = (tx: Parameters<Parameters<typeof withRollback>[0]>[0], id: string) =>
      tx.select().from(refunds).where(eq(refunds.reservationId, id));

    it('진행 중으로 저장하면 읽을 때 저장한 금액이 같이 오고, 환불 내역 칸은 비어 있다', async () => {
      await withRollback(async (tx) => {
        const made = await booking(tx);
        expect(await requestCancelRefund(tx, made.request)).toBe(true);
        expect(await rowsOf(tx, made.reservation.id)).toMatchObject([
          { status: 'requested', reason: 'customer_cancel', processedAt: null },
        ]);
        expect(await readRefundTarget(made.reservation.id, made.customerId, tx)).toMatchObject({
          status: 'confirmed',
          requested: { ...amounts, requestedAt: REQUESTED_AT },
        });
      });
    });

    it('이미 고객 취소 기록이 있으면 넣지 않고 false', async () => {
      await withRollback(async (tx) => {
        const made = await booking(tx);
        expect(await requestCancelRefund(tx, made.request)).toBe(true);
        expect(await requestCancelRefund(tx, { ...made.request, refundAmount: 1 })).toBe(false);
        expect(await rowsOf(tx, made.reservation.id)).toMatchObject([{ refundAmount: 9_800 }]);
      });
    });

    it('진행 중 표시를 지우면 다시 시작할 수 있고, 끝난 기록은 지우지 않는다', async () => {
      await withRollback(async (tx) => {
        const made = await booking(tx);
        await requestCancelRefund(tx, made.request);
        await clearRequestedCancel(tx, made.reservation.id);
        expect(await rowsOf(tx, made.reservation.id)).toEqual([]);
        expect(await readRefundTarget(made.reservation.id, made.customerId, tx)).toMatchObject({
          requested: null,
        });

        await requestCancelRefund(tx, made.request);
        await finishCancelRecord(tx, made.finish);
        await clearRequestedCancel(tx, made.reservation.id);
        expect(await rowsOf(tx, made.reservation.id)).toHaveLength(1);
      });
    });

    it('기록을 끝내면 예약·매물이 취소되고, 진행 중 기록이 끝남으로 바뀌며 한 줄이다', async () => {
      await withRollback(async (tx) => {
        const made = await booking(tx);
        await requestCancelRefund(tx, made.request);
        expect(await finishCancelRecord(tx, made.finish)).toBe(true);

        const [reservation] = await tx
          .select()
          .from(reservations)
          .where(eq(reservations.id, made.reservation.id));
        expect(reservation).toMatchObject({
          status: 'cancelled',
          cancelledAt: REQUESTED_AT,
          cancelActor: 'customer',
          hoursBeforeStartAtCancel: 30.5,
        });
        const [slot] = await tx.select().from(slots).where(eq(slots.id, made.slot.id));
        expect(slot.status).toBe('cancelled');
        const [order] = await tx.select().from(orders).where(eq(orders.id, made.order.id));
        expect(order.pgStatus).toBe('PARTIAL_CANCELLED');
        expect(await rowsOf(tx, made.reservation.id)).toMatchObject([
          {
            status: 'done',
            orderId: made.order.id,
            ...amounts,
            pgCancellationId: 'c-1',
            reviewReason: null,
            processedAt: NOW,
            createdAt: REQUESTED_AT,
          },
        ]);
      });
    });

    it('진행 중 기록이 지워졌어도 돈은 돌아갔으므로 새로 넣어 끝낸다', async () => {
      await withRollback(async (tx) => {
        const made = await booking(tx);
        expect(await finishCancelRecord(tx, made.finish)).toBe(true);
        expect(await rowsOf(tx, made.reservation.id)).toMatchObject([{ status: 'done' }]);
      });
    });

    it('실제 금액과 운영자 확인 이유를 남긴다', async () => {
      await withRollback(async (tx) => {
        const made = await booking(tx);
        await requestCancelRefund(tx, made.request);
        await finishCancelRecord(tx, {
          ...made.finish,
          refundAmount: 14_000,
          penaltyAmount: 0,
          reviewReason: '금액이 달라요',
        });
        expect(await rowsOf(tx, made.reservation.id)).toMatchObject([
          { refundAmount: 14_000, penaltyAmount: 0, reviewReason: '금액이 달라요' },
        ]);
        const [order] = await tx.select().from(orders).where(eq(orders.id, made.order.id));
        expect(order.pgStatus).toBe('CANCELLED');
      });
    });

    it('포트원을 부르지 않은 취소는 포트원 상태를 바꾸지 않는다', async () => {
      await withRollback(async (tx) => {
        const made = await booking(tx);
        await finishCancelRecord(tx, { ...made.finish, pgCancellationId: null });
        const [order] = await tx.select().from(orders).where(eq(orders.id, made.order.id));
        expect(order.pgStatus).toBeNull();
      });
    });

    it('두 번째 기록과 이용 완료한 예약은 아무것도 바꾸지 않고 false', async () => {
      await withRollback(async (tx) => {
        const made = await booking(tx);
        expect(await finishCancelRecord(tx, made.finish)).toBe(true);
        expect(await finishCancelRecord(tx, { ...made.finish, refundAmount: 1 })).toBe(false);
        expect(await rowsOf(tx, made.reservation.id)).toMatchObject([{ refundAmount: 9_800 }]);

        const done = await booking(tx, 'completed');
        expect(await finishCancelRecord(tx, done.finish)).toBe(false);
        const [slot] = await tx.select().from(slots).where(eq(slots.id, done.slot.id));
        expect(slot.status).toBe('completed');
      });
    });

    it('정리 작업은 오래된 진행 중 기록만 오래된 순서로 읽는다', async () => {
      await withRollback(async (tx) => {
        const older = await booking(tx);
        const newer = await booking(tx);
        const fresh = await booking(tx);
        const finished = await booking(tx);
        await requestCancelRefund(tx, older.request);
        await requestCancelRefund(tx, {
          ...newer.request,
          requestedAt: new Date(REQUESTED_AT.getTime() + 60_000),
        });
        await requestCancelRefund(tx, { ...fresh.request, requestedAt: NOW });
        await requestCancelRefund(tx, finished.request);
        await finishCancelRecord(tx, finished.finish);

        const mine = (await readStaleCancels(tx, { requestedBefore: NOW, limit: 100 })).filter(
          (row) =>
            [older, newer, fresh, finished].some((m) => m.reservation.id === row.reservationId),
        );
        expect(mine.map((row) => row.reservationId)).toEqual([
          older.reservation.id,
          newer.reservation.id,
        ]);
        expect(mine[0]).toMatchObject({
          orderId: older.order.id,
          slotId: older.slot.id,
          paymentId: older.order.paymentId,
          paidAmount: older.order.amount,
          startAt: older.slot.startAt,
          ...amounts,
          requestedAt: REQUESTED_AT,
        });
      });
    });

    function adminCancel(made: Awaited<ReturnType<typeof booking>>, refundAmount: number) {
      return {
        reservationId: made.reservation.id,
        orderId: made.order.id,
        slotId: made.slot.id,
        paidAmount: made.order.amount,
        refundAmount,
        pgCancellationId: 'c-9',
        reviewReason: null,
        hoursBeforeStart: 30.5,
        now: NOW,
      };
    }

    it('앱 밖 취소는 운영자 취소(admin_exception)로 예약·매물을 취소하고 실제 환불액을 남긴다(#248)', async () => {
      await withRollback(async (tx) => {
        const made = await booking(tx);
        expect(await finishAdminCancel(tx, adminCancel(made, made.order.amount))).toBe(true);

        const [reservation] = await tx
          .select()
          .from(reservations)
          .where(eq(reservations.id, made.reservation.id));
        expect(reservation).toMatchObject({
          status: 'cancelled',
          cancelledAt: NOW,
          cancelActor: 'admin',
        });
        const [slot] = await tx.select().from(slots).where(eq(slots.id, made.slot.id));
        expect(slot.status).toBe('cancelled');
        const [order] = await tx.select().from(orders).where(eq(orders.id, made.order.id));
        expect(order.pgStatus).toBe('CANCELLED');
        expect(await rowsOf(tx, made.reservation.id)).toMatchObject([
          {
            status: 'done',
            reason: 'admin_exception',
            band: null,
            penaltyRate: 0,
            refundAmount: made.order.amount,
            penaltyAmount: 0,
            pgCancellationId: 'c-9',
            processedAt: NOW,
          },
        ]);
      });
    });

    it('운영자 취소를 두 번 불러도 기록은 한 줄이고, 일부 환불은 나머지를 남긴다', async () => {
      await withRollback(async (tx) => {
        const made = await booking(tx);
        expect(await finishAdminCancel(tx, adminCancel(made, 5_000))).toBe(true);
        expect(await finishAdminCancel(tx, adminCancel(made, 5_000))).toBe(false);
        expect(await rowsOf(tx, made.reservation.id)).toMatchObject([
          { refundAmount: 5_000, penaltyAmount: made.order.amount - 5_000 },
        ]);
        const [order] = await tx.select().from(orders).where(eq(orders.id, made.order.id));
        expect(order.pgStatus).toBe('PARTIAL_CANCELLED');

        const done = await booking(tx, 'completed');
        expect(await finishAdminCancel(tx, adminCancel(done, 5_000))).toBe(false);
        expect(await rowsOf(tx, done.reservation.id)).toEqual([]);
      });
    });
  });

  describe('합의 후 취소 저장(#320)', () => {
    const REQUESTED_AT = new Date('2026-11-01T10:00:00+09:00');
    const NOW = new Date('2026-11-01T10:20:00+09:00');
    const agreed = {
      reason: 'agreed_cancel' as const,
      band: null,
      penaltyRate: 50,
      refundAmount: 7_000,
      penaltyAmount: 7_000,
    };

    it('진행 중으로 저장하고 끝내면 취소한 쪽 agreed, 같은 예약의 고객 취소는 함께 들어가지 않는다', async () => {
      await withRollback(async (tx) => {
        const shop = await createTestShop(tx, { status: 'approved' });
        const me = await createTestCustomer(tx);
        const made = await createTestReservation(
          tx,
          shop,
          me.customerId,
          '10:00',
          '11:00',
          'confirmed',
        );
        const base = { reservationId: made.reservation.id, orderId: made.order.id };
        expect(
          await requestCancelRefund(tx, { ...base, ...agreed, requestedAt: REQUESTED_AT }),
        ).toBe(true);
        // 손님이 같은 순간 직접 취소해도 취소 환불 기록은 하나다
        expect(
          await requestCancelRefund(tx, {
            ...base,
            reason: 'customer_cancel',
            band: 'over_24h',
            penaltyRate: 30,
            refundAmount: 9_800,
            penaltyAmount: 4_200,
            requestedAt: REQUESTED_AT,
          }),
        ).toBe(false);
        expect(await readRefundTarget(made.reservation.id, me.customerId, tx)).toMatchObject({
          requested: { reason: 'agreed_cancel', band: null, refundAmount: 7_000 },
        });

        expect(
          await finishCancelRecord(tx, {
            ...base,
            ...agreed,
            slotId: made.slot.id,
            pgCancellationId: 'c-1',
            reviewReason: null,
            hoursBeforeStart: -1,
            requestedAt: REQUESTED_AT,
            now: NOW,
          }),
        ).toBe(true);
        const [reservation] = await tx
          .select()
          .from(reservations)
          .where(eq(reservations.id, made.reservation.id));
        expect(reservation).toMatchObject({ status: 'cancelled', cancelActor: 'agreed' });
        const rows = await tx
          .select()
          .from(refunds)
          .where(eq(refunds.reservationId, made.reservation.id));
        expect(rows).toMatchObject([
          { reason: 'agreed_cancel', status: 'done', refundAmount: 7_000, band: null },
        ]);
      });
    });
  });
});
