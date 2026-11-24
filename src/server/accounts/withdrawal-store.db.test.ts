// 회원 탈퇴 막는 이유를 세는 DB 읽기(#154)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 고객 계정·원장님 샵마다 이용 예정·방문 확인 중 예약, 손님 결제 중, 확인 중 이의제기, 안 쓴 쿠폰, 미지급 정산금, 미수 패널티,
// 일괄 마감할 판매 전 매물·시간대를 그 계정 것만 세는지 본다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { coupons, disputes, ownerPenalties, slots, slotWindows } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  type TestShop,
  testSlot,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import { readCustomerWithdrawalFacts, readOwnerWithdrawalFacts } from './withdrawal-store';

const kst = (dateTime: string) => new Date(`${dateTime}+09:00`);
/** 탈퇴 화면을 연 시각. 11/1 매물은 시작 전이다 */
const NOW = kst('2026-10-31T12:00:00');

/** 예약의 매물 시각을 바꾼다(시작이 지난 예약·끝난 예약을 만들 때) */
async function moveSlot(tx: TestTx, slotId: string, start: string, end: string) {
  await tx
    .update(slots)
    .set({ startAt: kst(start), endAt: kst(end) })
    .where(eq(slots.id, slotId));
}

async function addDispute(tx: TestTx, reservationId: string, status: 'open' | 'resolved') {
  await tx.insert(disputes).values({
    reservationId,
    type: 'after_start',
    content: '시술이 약속과 달랐어요',
    status,
    channel: 'app',
    receivedAt: kst('2026-10-30T20:00:00'),
    ...(status === 'resolved'
      ? { outcome: 'no_change' as const, handledAt: kst('2026-10-31T09:00:00') }
      : {}),
  });
}

/** 방문 완료로 끝난 예약(10/30 10~11시, 11:30 처리). start·end는 처음 만들 때의 11/1 칸(겹치지 않게 고른다) */
async function visited(tx: TestTx, shop: TestShop, customerId: string, start: string, end: string) {
  const made = await createTestReservation(tx, shop, customerId, start, end, 'completed', {
    visitResult: 'visited',
    visitRecordedAt: kst('2026-10-30T11:30:00'),
  });
  await moveSlot(tx, made.slot.id, '2026-10-30T10:00:00', '2026-10-30T11:00:00');
  return made;
}

describeDb('회원 탈퇴 막는 이유 세기 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('고객: 이용 예정·방문 확인 중 예약, 확인 중 이의제기, 안 쓴 쿠폰, 결제 중을 그 고객 것만 센다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const someoneElse = await createTestCustomer(tx);

      // 이용 예정 예약 하나(11/1 9시)
      await createTestReservation(tx, shop, customerId, '09:00', '10:00', 'confirmed');
      // 시작이 지났는데 방문 처리 전 하나
      const pending = await createTestReservation(
        tx,
        shop,
        customerId,
        '10:00',
        '11:00',
        'confirmed',
      );
      await moveSlot(tx, pending.slot.id, '2026-10-31T09:00:00', '2026-10-31T10:00:00');
      // 끝난 예약 둘: 하나는 확인 중 이의제기, 하나는 결론 난 이의제기
      await addDispute(
        tx,
        (await visited(tx, shop, customerId, '11:00', '12:00')).reservation.id,
        'open',
      );
      const resolved = await createTestReservation(
        tx,
        shop,
        customerId,
        '12:00',
        '13:00',
        'completed',
        {
          visitResult: 'visited',
          visitRecordedAt: kst('2026-10-30T12:30:00'),
        },
      );
      await moveSlot(tx, resolved.slot.id, '2026-10-30T12:00:00', '2026-10-30T13:00:00');
      await addDispute(tx, resolved.reservation.id, 'resolved');
      // 취소한 예약은 세지 않는다
      await createTestReservation(tx, shop, customerId, '13:00', '14:00', 'cancelled', {
        cancelActor: 'customer',
        cancelledAt: kst('2026-10-30T09:00:00'),
      });
      // 쿠폰: 안 씀·기한 남음 하나만 센다(기한 지남, 쓴 쿠폰은 빼고)
      const coupon = (extra: Partial<typeof coupons.$inferInsert>) => ({
        customerId,
        amount: 3000,
        reason: 'owner_fault_compensation',
        issuedAt: kst('2026-10-01T00:00:00'),
        expiresAt: kst('2026-12-30T00:00:00'),
        ...extra,
      });
      await tx
        .insert(coupons)
        .values([
          coupon({}),
          coupon({ expiresAt: kst('2026-10-31T12:00:00') }),
          coupon({ usedOrderId: pending.order.id, usedAt: kst('2026-10-30T10:00:00') }),
        ]);
      // 지금 결제 중인 매물
      await tx.insert(slots).values(
        testSlot(shop, '15:00', '16:00', {
          holdCustomerId: customerId,
          holdExpiresAt: kst('2026-10-31T12:05:00'),
        }),
      );
      // 다른 고객의 이용 예정 예약
      await createTestReservation(tx, shop, someoneElse.customerId, '16:00', '17:00', 'confirmed');

      expect(await readCustomerWithdrawalFacts(tx, customerId, NOW)).toEqual({
        upcomingReservations: 1,
        visitPendingReservations: 1,
        openDisputes: 1,
        unusedCoupons: 1,
        holding: true,
      });
      // 아무것도 없는 고객
      expect(await readCustomerWithdrawalFacts(tx, someoneElse.customerId, NOW)).toMatchObject({
        upcomingReservations: 1,
        visitPendingReservations: 0,
        openDisputes: 0,
        unusedCoupons: 0,
        holding: false,
      });
    });
  });

  it('원장님: 예약된 매물·손님 결제 중·방문 확인 중·이의제기·미지급 정산금·미수 패널티·판매 전 매물과 시간대를 그 샵 것만 센다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const other = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);

      await createTestReservation(tx, shop, customerId, '09:00', '10:00', 'confirmed');
      const pending = await createTestReservation(
        tx,
        shop,
        customerId,
        '10:00',
        '11:00',
        'confirmed',
      );
      await moveSlot(tx, pending.slot.id, '2026-10-31T09:00:00', '2026-10-31T10:00:00');
      // 끝난 예약: 하나는 지급 예정(미지급 정산금), 하나는 확인 중 이의제기(보류)
      await visited(tx, shop, customerId, '11:00', '12:00');
      const disputed = await createTestReservation(
        tx,
        shop,
        customerId,
        '12:00',
        '13:00',
        'completed',
        {
          visitResult: 'visited',
          visitRecordedAt: kst('2026-10-30T12:30:00'),
        },
      );
      await moveSlot(tx, disputed.slot.id, '2026-10-30T12:00:00', '2026-10-30T13:00:00');
      await addDispute(tx, disputed.reservation.id, 'open');
      // 원장님 사정 취소와 그 패널티(5,000원 중 2,000원 걷음)
      const ownerFault = await createTestReservation(
        tx,
        shop,
        customerId,
        '13:00',
        '14:00',
        'cancelled',
        {
          cancelActor: 'owner_fault',
          cancelledAt: kst('2026-10-30T09:00:00'),
        },
      );
      await tx.insert(ownerPenalties).values({
        shopId: shop.shopId,
        reservationId: ownerFault.reservation.id,
        amount: 5000,
        collectedAmount: 2000,
      });
      // 판매 전 매물: 손님이 결제 중 하나, 그냥 게시중 하나, 게시예정 하나. 시간대 하나
      await tx.insert(slots).values([
        testSlot(shop, '15:00', '16:00', {
          holdCustomerId: customerId,
          holdExpiresAt: kst('2026-10-31T12:05:00'),
        }),
        testSlot(shop, '16:00', '17:00'),
        testSlot(shop, '17:00', '18:00', {
          status: 'scheduled',
          publishAt: kst('2026-10-31T18:00:00'),
        }),
        // 결제 기한이 지난 홀딩은 결제 중이 아니다
        testSlot(shop, '18:00', '19:00', {
          holdCustomerId: customerId,
          holdExpiresAt: kst('2026-10-31T11:50:00'),
        }),
      ]);
      await tx.insert(slotWindows).values({
        shopId: shop.shopId,
        startAt: kst('2026-11-02T13:00:00'),
        endAt: kst('2026-11-02T15:00:00'),
        publishAt: kst('2026-10-30T10:00:00'),
        status: 'published',
        createdBy: shop.createdBy,
      });
      // 다른 샵의 예약된 매물
      await createTestReservation(tx, other, customerId, '09:00', '10:00', 'confirmed');

      expect(await readOwnerWithdrawalFacts(tx, shop.shopId, NOW)).toEqual({
        upcomingReservations: 1,
        heldByCustomer: 1,
        visitPendingReservations: 1,
        openDisputes: 1,
        // 10/30(금) 11:30 방문 처리 → 이의제기 기한 영업일 48시간(11/3 화 11:30) → 첫 목요일 11/5
        unpaidSettlement: { nextPayoutDate: '2026-11-05' },
        outstandingPenalty: 3000,
        // 판매 전 한 시술 매물 넷(결제 중·게시중·게시예정·기한 지난 홀딩) + 시간대 하나
        openSlotCount: 5,
      });
    });
  });

  it('원장님: 정산할 금액이 없는 끝난 거래(원장님 사정 취소)만 있으면 미지급 정산금으로 막지 않는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      await createTestReservation(tx, shop, customerId, '13:00', '14:00', 'cancelled', {
        cancelActor: 'owner_fault',
        cancelledAt: kst('2026-10-30T09:00:00'),
      });
      expect(await readOwnerWithdrawalFacts(tx, shop.shopId, NOW)).toEqual({
        upcomingReservations: 0,
        heldByCustomer: 0,
        visitPendingReservations: 0,
        openDisputes: 0,
        unpaidSettlement: null,
        outstandingPenalty: 0,
        openSlotCount: 0,
      });
    });
  });
});
