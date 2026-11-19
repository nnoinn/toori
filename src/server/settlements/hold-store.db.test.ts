// 운영자 정산 보류·풀기(#373 ②)의 저장을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 막는 조건(없음·정산할 것 없음·이미 묶임·이미 보류 중·이미 풀림), 처리 기록, 원장님 정산 내역의 보류 표시(hasAdminHold)를 본다.
// 목요일 묶기에서 빠지는지는 batch.db.test.ts가 본다.

import { asc, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { adminActions, settlementHolds, settlementItems, settlements } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  createTestUser,
  type TestShop,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import { holdReservationInTx, holdShopInTx, releaseHoldInTx } from './hold-store';
import { readShopSettlementRows } from './settlement-store';

const NOW = new Date('2026-11-16T10:00:00+09:00');
const LATER = new Date('2026-11-16T11:00:00+09:00');

/** 11/01 방문 완료한 예약 */
async function visited(tx: TestTx, shop: TestShop, start: string, end: string) {
  const { customerId } = await createTestCustomer(tx);
  return createTestReservation(tx, shop, customerId, start, end, 'completed', {
    visitResult: 'visited',
    visitRecordedAt: new Date('2026-11-01T11:00:00+09:00'),
  });
}

async function actionsOn(tx: TestTx, targetId: string) {
  return (
    tx
      .select({
        adminId: adminActions.adminId,
        action: adminActions.action,
        targetType: adminActions.targetType,
        memo: adminActions.memo,
      })
      .from(adminActions)
      .where(eq(adminActions.targetId, targetId))
      // 한 트랜잭션 안이라 남긴 시각이 같다. 이름 순(hold → release)으로 본다
      .orderBy(asc(adminActions.action))
  );
}

async function holdRow(tx: TestTx, holdId: string) {
  const [row] = await tx.select().from(settlementHolds).where(eq(settlementHolds.id, holdId));
  return row;
}

async function adminHoldOf(tx: TestTx, shopId: string) {
  const rows = await readShopSettlementRows(tx, { shopId, unpaidOnly: true });
  return Object.fromEntries(rows.map((row) => [row.reservationId, row.hasAdminHold]));
}

/** 원장님 정산 내역이 읽는 보류 사유 코드(#489). 보류가 없으면 null */
async function adminHoldCodeOf(tx: TestTx, shopId: string) {
  const rows = await readShopSettlementRows(tx, { shopId, unpaidOnly: true });
  return Object.fromEntries(rows.map((row) => [row.reservationId, row.adminHoldCode]));
}

describeDb('운영자 정산 보류 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('거래 보류를 걸면 사유·운영자·시각과 settlement.hold 기록을 남기고, 두 번째는 ALREADY_HELD, 풀면 settlement.release 기록과 함께 풀리고 다시 걸 수 있다', async () => {
    await withRollback(async (tx) => {
      const adminId = await createTestUser(tx);
      const shop = await createTestShop(tx, { status: 'approved' });
      const made = await visited(tx, shop, '09:00', '10:00');
      const other = await visited(tx, shop, '10:00', '11:00');
      const reservationId = made.reservation.id;

      const held = await holdReservationInTx(tx, {
        reservationId,
        adminId,
        reason: '계좌 확인 필요',
        code: 'payout_info_check',
        now: NOW,
      });
      expect(held).toMatchObject({ ok: true, data: { heldAt: NOW.toISOString() } });
      if (!held.ok) return;
      expect(await holdRow(tx, held.data.holdId)).toMatchObject({
        reservationId,
        shopId: null,
        reason: '계좌 확인 필요',
        reasonCode: 'payout_info_check',
        heldBy: adminId,
        heldAt: NOW,
        releasedAt: null,
      });
      expect(await adminHoldOf(tx, shop.shopId)).toEqual({
        [reservationId]: true,
        [other.reservation.id]: false,
      });

      expect(
        await holdReservationInTx(tx, {
          reservationId,
          adminId,
          reason: '다시',
          code: 'other',
          now: NOW,
        }),
      ).toMatchObject({ error: { code: 'ALREADY_HELD' } });

      const release = (holdId: string) =>
        releaseHoldInTx(tx, { holdId, adminId, memo: '계좌 확인함', now: LATER });
      expect(await release(held.data.holdId)).toEqual({
        ok: true,
        data: { holdId: held.data.holdId, releasedAt: LATER.toISOString() },
      });
      expect(await holdRow(tx, held.data.holdId)).toMatchObject({
        releasedBy: adminId,
        releasedAt: LATER,
        releaseMemo: '계좌 확인함',
      });
      expect(await adminHoldOf(tx, shop.shopId)).toMatchObject({ [reservationId]: false });
      expect(await release(held.data.holdId)).toMatchObject({
        error: { code: 'ALREADY_RELEASED' },
      });
      expect(await release(crypto.randomUUID())).toMatchObject({
        error: { code: 'HOLD_NOT_FOUND' },
      });

      expect(await actionsOn(tx, reservationId)).toEqual([
        { adminId, action: 'settlement.hold', targetType: 'reservation', memo: '계좌 확인 필요' },
        { adminId, action: 'settlement.release', targetType: 'reservation', memo: '계좌 확인함' },
      ]);
      // 지난 보류는 남기고 새로 걸 수 있다
      expect(
        await holdReservationInTx(tx, {
          reservationId,
          adminId,
          reason: '다시 확인',
          code: 'user_inquiry',
          now: LATER,
        }),
      ).toMatchObject({ ok: true });
      expect(
        await tx
          .select()
          .from(settlementHolds)
          .where(eq(settlementHolds.reservationId, reservationId)),
      ).toHaveLength(2);
    });
  });

  it('없는 예약, 정산할 것이 없는 예약(원장님 사정 취소), 이미 묶인 예약은 막고, 예정 예약은 걸 수 있다', async () => {
    await withRollback(async (tx) => {
      const adminId = await createTestUser(tx);
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const hold = (reservationId: string) =>
        holdReservationInTx(tx, {
          reservationId,
          adminId,
          reason: '확인',
          code: 'other',
          now: NOW,
        });

      expect(await hold(crypto.randomUUID())).toMatchObject({
        error: { code: 'RESERVATION_NOT_FOUND' },
      });

      const ownerFault = await createTestReservation(
        tx,
        shop,
        customerId,
        '08:00',
        '09:00',
        'cancelled',
        { cancelActor: 'owner_fault', cancelledAt: new Date('2026-10-31T10:00:00+09:00') },
      );
      expect(await hold(ownerFault.reservation.id)).toMatchObject({
        error: { code: 'NOTHING_TO_SETTLE' },
      });

      const bundled = await visited(tx, shop, '09:00', '10:00');
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
        kind: 'sale',
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
      expect(await hold(bundled.reservation.id)).toMatchObject({
        error: { code: 'ALREADY_BUNDLED' },
      });

      const upcoming = await createTestReservation(
        tx,
        shop,
        customerId,
        '10:00',
        '11:00',
        'confirmed',
      );
      expect(await hold(upcoming.reservation.id)).toMatchObject({ ok: true });
      for (const blocked of [ownerFault, bundled]) {
        expect(
          await tx
            .select()
            .from(settlementHolds)
            .where(eq(settlementHolds.reservationId, blocked.reservation.id)),
        ).toEqual([]);
      }
    });
  });

  describe('샵 전체 보류', () => {
    it('그 샵의 묶이지 않은 거래가 모두 보류로 보이고, 두 번째는 ALREADY_HELD, 없는 샵은 SHOP_NOT_FOUND, 풀면 돌아온다', async () => {
      await withRollback(async (tx) => {
        const adminId = await createTestUser(tx);
        const shop = await createTestShop(tx, { status: 'approved' });
        const otherShop = await createTestShop(tx, { status: 'approved' });
        const a = await visited(tx, shop, '09:00', '10:00');
        const b = await visited(tx, shop, '10:00', '11:00');
        const elsewhere = await visited(tx, otherShop, '09:00', '10:00');
        const holdShop = (shopId: string) =>
          holdShopInTx(tx, {
            shopId,
            adminId,
            reason: '사업자 정보 확인',
            code: 'user_inquiry',
            now: NOW,
          });

        const held = await holdShop(shop.shopId);
        expect(held).toMatchObject({ ok: true });
        if (!held.ok) return;
        expect(await holdRow(tx, held.data.holdId)).toMatchObject({
          reservationId: null,
          shopId: shop.shopId,
          reasonCode: 'user_inquiry',
        });
        expect(await adminHoldOf(tx, shop.shopId)).toEqual({
          [a.reservation.id]: true,
          [b.reservation.id]: true,
        });
        expect(await adminHoldOf(tx, otherShop.shopId)).toEqual({
          [elsewhere.reservation.id]: false,
        });
        expect(await holdShop(shop.shopId)).toMatchObject({ error: { code: 'ALREADY_HELD' } });
        expect(await holdShop(crypto.randomUUID())).toMatchObject({
          error: { code: 'SHOP_NOT_FOUND' },
        });
        expect(await actionsOn(tx, shop.shopId)).toEqual([
          { adminId, action: 'settlement.hold', targetType: 'shop', memo: '사업자 정보 확인' },
        ]);

        await releaseHoldInTx(tx, {
          holdId: held.data.holdId,
          adminId,
          memo: '확인함',
          now: LATER,
        });
        expect(await adminHoldOf(tx, shop.shopId)).toEqual({
          [a.reservation.id]: false,
          [b.reservation.id]: false,
        });
        expect((await actionsOn(tx, shop.shopId)).map((row) => row.action)).toEqual([
          'settlement.hold',
          'settlement.release',
        ]);
      });
    });

    it('원장님 정산 내역은 고른 사유 코드(#489)를 읽고, 거래 보류와 샵 전체 보류가 같이 있으면 거래 보류의 코드다. 풀리면 null', async () => {
      await withRollback(async (tx) => {
        const adminId = await createTestUser(tx);
        const shop = await createTestShop(tx, { status: 'approved' });
        const a = await visited(tx, shop, '09:00', '10:00');
        const b = await visited(tx, shop, '10:00', '11:00');
        const c = await visited(tx, shop, '11:00', '12:00');
        const reservationHold = await holdReservationInTx(tx, {
          reservationId: a.reservation.id,
          adminId,
          reason: '결제 내역 확인',
          code: 'payment_check',
          now: NOW,
        });
        expect(reservationHold).toMatchObject({ ok: true });
        expect(await adminHoldCodeOf(tx, shop.shopId)).toEqual({
          [a.reservation.id]: 'payment_check',
          [b.reservation.id]: null,
          [c.reservation.id]: null,
        });

        // 샵 전체 보류를 나중에 걸어도 거래 보류가 있는 거래는 거래 보류의 코드
        const shopHold = await holdShopInTx(tx, {
          shopId: shop.shopId,
          adminId,
          reason: '문의 확인',
          code: 'user_inquiry',
          now: LATER,
        });
        expect(shopHold).toMatchObject({ ok: true });
        expect(await adminHoldCodeOf(tx, shop.shopId)).toEqual({
          [a.reservation.id]: 'payment_check',
          [b.reservation.id]: 'user_inquiry',
          [c.reservation.id]: 'user_inquiry',
        });

        if (!reservationHold.ok) return;
        await releaseHoldInTx(tx, {
          holdId: reservationHold.data.holdId,
          adminId,
          memo: '확인함',
          now: LATER,
        });
        expect(await adminHoldCodeOf(tx, shop.shopId)).toEqual({
          [a.reservation.id]: 'user_inquiry',
          [b.reservation.id]: 'user_inquiry',
          [c.reservation.id]: 'user_inquiry',
        });
      });
    });
  });
});
