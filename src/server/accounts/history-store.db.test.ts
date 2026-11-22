// 계정 이력 DB 읽기(#374)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 원장님 이력은 그 샵 것만(다른 샵·손님이 시간대 안에서 만든 칸은 빼고), 고객 이력은 그 고객 것만 최신 순으로 읽는지,
// 기간·종류로 고르면 그것만 읽고 세는지, 시각이 같은 일이 많아도 쪽을 넘길 때 겹치거나 빠지지 않는지 본다.
// 테스트 데이터는 한 트랜잭션이라 기본 시각(now())이 같아서, 비교할 기록은 시각을 직접 넣고 before로 그 뒤 기록은 뺀다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import {
  coupons,
  customers,
  orders,
  owners,
  payoutAccountChanges,
  refunds,
  slots,
  slotWindows,
  termsAgreements,
} from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  testSlot,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import { toHistoryPage } from './history-page';
import { readCustomerHistory, readOwnerHistory, readOwnerShopId } from './history-store';
import { type AccountHistoryKind, HISTORY_CATEGORY_KINDS } from './history-types';

const at = (iso: string) => new Date(iso);
/** 이 시각 뒤에 생긴 기록(테스트가 시각을 넣지 않은 것)은 보지 않는다 */
const BEFORE = at('2026-11-01T00:00:00Z');

/** 주문에 쿠폰을 적고 결제 시각을 정한다(쿠폰 사용 줄은 결제 시각) */
async function putCouponOn(tx: TestTx, orderId: string, couponId: string, paidAt: Date) {
  await tx
    .update(orders)
    .set({ couponId, couponAmount: 3_000, paidAt })
    .where(eq(orders.id, orderId));
}

/**
 * 쿠폰 이력 테스트 데이터. 한 고객이 쿠폰 4장을 이렇게 썼다:
 * ① 원장님 사정 취소로 돌려받았다가 다른 예약에 다시 씀 → 사용 두 줄, 돌려받음 한 줄
 * ② 고객이 취소(돌려주지 않음)한 뒤 무효 → 무효로 돌려받음
 * ③ 원장님 사정 취소 뒤 무효 → 원장님 사정 취소 때 한 번만
 * ④ 원장님 사정 취소 환불이 아직 진행 중 → 사용만(아직 돌려주지 않았다)
 * 쿠폰 없이 무효로 한 예약, 결제에 실패한 주문(예약 없음)에 적힌 쿠폰, 다른 고객의 쿠폰 사용은 넣지 않아야 한다
 */
async function seedCouponStory(tx: TestTx) {
  const shop = await createTestShop(tx, { status: 'approved' });
  const { userId, customerId } = await createTestCustomer(tx);
  const someoneElse = await createTestCustomer(tx);
  const coupon = async (owner: string) => {
    const [row] = await tx
      .insert(coupons)
      .values({
        customerId: owner,
        amount: 3_000,
        reason: 'owner_fault_compensation',
        issuedAt: at('2026-10-01T00:00:00Z'),
        expiresAt: at('2026-12-30T00:00:00Z'),
      })
      .returning({ id: coupons.id });
    return row.id;
  };
  const ownerFaultRefund = (
    booked: { order: { id: string }; reservation: { id: string } },
    status: 'requested' | 'done',
    processedAt: Date | null,
  ) =>
    tx.insert(refunds).values({
      orderId: booked.order.id,
      reservationId: booked.reservation.id,
      reason: 'owner_fault',
      status,
      band: null,
      penaltyRate: 0,
      refundAmount: 20_450,
      penaltyAmount: 0,
      processedAt,
    });

  // ①
  const first = await coupon(customerId);
  const returnedByOwner = await createTestReservation(
    tx,
    shop,
    customerId,
    '09:00',
    '10:00',
    'cancelled',
    {
      cancelActor: 'owner_fault',
      cancelledAt: at('2026-10-12T00:00:00Z'),
    },
  );
  await putCouponOn(tx, returnedByOwner.order.id, first, at('2026-10-10T00:00:00Z'));
  await ownerFaultRefund(returnedByOwner, 'done', at('2026-10-12T00:01:00Z'));
  const reused = await createTestReservation(tx, shop, customerId, '10:00', '11:00', 'confirmed');
  await putCouponOn(tx, reused.order.id, first, at('2026-10-14T00:00:00Z'));

  // ②
  const voidedAfterCustomer = await createTestReservation(
    tx,
    shop,
    customerId,
    '11:00',
    '12:00',
    'cancelled',
    {
      cancelActor: 'customer',
      cancelledAt: at('2026-10-16T00:00:00Z'),
      voidedAt: at('2026-10-18T00:00:00Z'),
    },
  );
  const second = await coupon(customerId);
  await putCouponOn(tx, voidedAfterCustomer.order.id, second, at('2026-10-15T00:00:00Z'));

  // ③
  const voidedAfterOwner = await createTestReservation(
    tx,
    shop,
    customerId,
    '12:00',
    '13:00',
    'cancelled',
    {
      cancelActor: 'owner_fault',
      cancelledAt: at('2026-10-20T00:00:00Z'),
      voidedAt: at('2026-10-22T00:00:00Z'),
    },
  );
  await putCouponOn(
    tx,
    voidedAfterOwner.order.id,
    await coupon(customerId),
    at('2026-10-19T00:00:00Z'),
  );
  await ownerFaultRefund(voidedAfterOwner, 'done', at('2026-10-20T00:01:00Z'));

  // ④
  const refunding = await createTestReservation(
    tx,
    shop,
    customerId,
    '13:00',
    '14:00',
    'confirmed',
  );
  await putCouponOn(tx, refunding.order.id, await coupon(customerId), at('2026-10-23T00:00:00Z'));
  await ownerFaultRefund(refunding, 'requested', null);

  // 넣지 않아야 하는 것
  await createTestReservation(tx, shop, customerId, '14:00', '15:00', 'completed', {
    voidedAt: at('2026-10-24T00:00:00Z'),
  });
  const [failedSlot] = await tx
    .insert(slots)
    .values(testSlot(shop, '15:00', '16:00'))
    .returning({ id: slots.id });
  await tx.insert(orders).values({
    paymentId: `test_${crypto.randomUUID()}`,
    slotId: failedSlot.id,
    customerId,
    salePrice: 23_450,
    couponId: second,
    couponAmount: 3_000,
    amount: 20_450,
    refundPolicyVersion: 'test',
    refundPolicyAgreedAt: at('2026-10-25T00:00:00Z'),
    status: 'failed',
    paidAt: at('2026-10-25T00:00:00Z'),
  });
  const others = await createTestReservation(
    tx,
    shop,
    someoneElse.customerId,
    '16:00',
    '17:00',
    'confirmed',
  );
  await putCouponOn(
    tx,
    others.order.id,
    await coupon(someoneElse.customerId),
    at('2026-10-26T00:00:00Z'),
  );

  return {
    userId,
    customerId,
    returnedByOwner,
    reused,
    voidedAfterCustomer,
    voidedAfterOwner,
    refunding,
  };
}

/** 고른 종류의 고객 이력 1쪽 */
async function readCoupons(
  tx: TestTx,
  story: { customerId: string; userId: string },
  kinds: AccountHistoryKind[],
  before: Date,
) {
  const lists = await readCustomerHistory(tx, {
    customerId: story.customerId,
    userId: story.userId,
    from: null,
    before,
    kinds,
    take: 30,
  });
  return toHistoryPage(lists, 1, 30);
}

describeDb('계정 이력 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('원장님 이력: 그 샵의 입점 신청·매물 등록·게시·마감·예약·취소·정산 계좌 변경을 최신 순으로, 다른 샵과 시간대 안 손님 칸은 빼고', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, {
        status: 'approved',
        appliedAt: at('2026-10-01T00:00:00Z'),
      });
      const other = await createTestShop(tx, { status: 'approved' });
      const [owner] = await tx
        .select({ id: owners.id })
        .from(owners)
        .where(eq(owners.userId, shop.createdBy));
      expect(await readOwnerShopId(tx, owner.id)).toBe(shop.shopId);

      const [direct] = await tx
        .insert(slots)
        .values({
          ...testSlot(shop, '10:00', '11:00'),
          createdAt: at('2026-10-20T00:00:00Z'),
          publishAt: at('2026-10-20T00:00:00Z'),
        })
        .returning();
      const [scheduled] = await tx
        .insert(slots)
        .values({
          ...testSlot(shop, '12:00', '13:00'),
          createdAt: at('2026-10-21T00:00:00Z'),
          publishAt: at('2026-10-25T00:00:00Z'),
        })
        .returning();
      const [closed] = await tx
        .insert(slots)
        .values({
          ...testSlot(shop, '14:00', '15:00', { status: 'closed' }),
          createdAt: at('2026-10-22T00:00:00Z'),
          publishAt: at('2026-10-22T00:00:00Z'),
          closedAt: at('2026-10-23T00:00:00Z'),
          closeReason: 'other_channel',
        })
        .returning();
      // 다른 샵 매물
      await tx
        .insert(slots)
        .values({ ...testSlot(other, '10:00', '11:00'), createdAt: at('2026-10-24T00:00:00Z') });
      // 손님이 시간대 안에서 만든 칸은 원장님이 올린 매물이 아니다
      const [window] = await tx
        .insert(slotWindows)
        .values({
          shopId: shop.shopId,
          startAt: at('2026-11-01T09:00:00Z'),
          endAt: at('2026-11-01T11:00:00Z'),
          publishAt: at('2026-10-26T00:00:00Z'),
          status: 'published',
          createdBy: shop.createdBy,
          createdAt: at('2026-10-26T00:00:00Z'),
        })
        .returning();
      await tx.insert(slots).values({
        ...testSlot(shop, '18:00', '19:00'),
        windowId: window.id,
        createdAt: at('2026-10-27T00:00:00Z'),
      });

      const { customerId } = await createTestCustomer(tx);
      const booked = await createTestReservation(
        tx,
        shop,
        customerId,
        '16:00',
        '17:00',
        'cancelled',
        {
          createdAt: at('2026-10-28T00:00:00Z'),
          cancelledAt: at('2026-10-30T12:00:00Z'),
          cancelActor: 'customer',
        },
      );
      await tx.insert(refunds).values({
        orderId: booked.order.id,
        reservationId: booked.reservation.id,
        reason: 'customer_cancel',
        status: 'done',
        band: 'over_24h',
        penaltyRate: 30,
        refundAmount: 9_800,
        penaltyAmount: 4_200,
        processedAt: at('2026-10-30T12:00:00Z'),
      });
      await tx.insert(payoutAccountChanges).values({
        shopId: shop.shopId,
        changedBy: shop.createdBy,
        previousBankCode: '088',
        previousAccountLast4: '1111',
        bankCode: '004',
        accountLast4: '2222',
        createdAt: at('2026-10-31T00:00:00Z'),
      });

      const read = (range: Partial<Parameters<typeof readOwnerHistory>[1]> = {}) =>
        readOwnerHistory(tx, {
          shopId: shop.shopId,
          now: at('2026-11-14T00:00:00Z'),
          from: null,
          before: BEFORE,
          kinds: null,
          take: 30,
          ...range,
        });
      const page = toHistoryPage(await read(), 1, 30);
      expect(page.events.map((event) => event.key)).toEqual([
        expect.stringMatching(/^payout_account_changed:/),
        `reservation_cancelled:${booked.reservation.id}`,
        `reservation_created:${booked.reservation.id}`,
        `window_created:${window.id}`,
        `slot_published:${scheduled.id}`,
        `slot_closed:${closed.id}`,
        `slot_created:${closed.id}`,
        `slot_created:${scheduled.id}`,
        `slot_created:${direct.id}`,
        `shop_applied:${shop.shopId}`,
      ]);
      expect(page.events[0]).toMatchObject({ kind: 'payout_account_changed', reason: '004' });
      // 한국 시간 11/1 16:00 시작, 10/30 21:00에 취소 → 43시간 전
      expect(page.events[1]).toMatchObject({
        kind: 'reservation_cancelled',
        reservationCode: booked.reservation.code,
        reason: 'customer',
        rate: 30,
        hoursBeforeStart: 43,
      });
      expect(page.events[5]).toMatchObject({ kind: 'slot_closed', reason: 'other_channel' });
      expect(page.total).toBe(10);

      // 매물·시간대 묶음, 한국 10/21 9시 ~ 10/24 9시 전: 10/21 등록, 10/22 등록, 10/23 마감만
      const slotOnly = toHistoryPage(
        await read({
          kinds: HISTORY_CATEGORY_KINDS.slot,
          from: at('2026-10-21T00:00:00Z'),
          before: at('2026-10-24T00:00:00Z'),
        }),
        1,
        30,
      );
      expect(slotOnly.events.map((event) => event.key)).toEqual([
        `slot_closed:${closed.id}`,
        `slot_created:${closed.id}`,
        `slot_created:${scheduled.id}`,
      ]);
      expect(slotOnly.total).toBe(3);
    });
  });

  it('한 번에 만든 매물처럼 시각이 같은 일이 한 쪽보다 많아도, 쪽을 넘길 때 겹치거나 빠지지 않는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, {
        status: 'approved',
        appliedAt: at('2026-10-01T00:00:00Z'),
      });
      const sameTime = at('2026-10-20T00:00:00Z');
      const made = await tx
        .insert(slots)
        .values(
          [
            ['10:00', '11:00'],
            ['12:00', '13:00'],
            ['14:00', '15:00'],
            ['16:00', '17:00'],
          ].map(([start, end]) => ({
            ...testSlot(shop, start, end),
            createdAt: sameTime,
            publishAt: sameTime,
          })),
        )
        .returning({ id: slots.id });
      // 한 쪽 2줄: 쪽마다 기록별로 (쪽 × 2)개까지 읽는다
      const pageOf = async (page: number) =>
        toHistoryPage(
          await readOwnerHistory(tx, {
            shopId: shop.shopId,
            now: at('2026-11-14T00:00:00Z'),
            from: null,
            before: BEFORE,
            kinds: null,
            take: page * 2,
          }),
          page,
          2,
        );
      const [first, second, third] = [await pageOf(1), await pageOf(2), await pageOf(3)];
      expect(first).toMatchObject({ page: 1, pageCount: 3, total: 5 });
      const slotKeys = [...first.events, ...second.events].map((event) => event.key);
      expect(slotKeys.toSorted()).toEqual(made.map((slot) => `slot_created:${slot.id}`).toSorted());
      expect(third.events.map((event) => event.key)).toEqual([`shop_applied:${shop.shopId}`]);
    });
  });

  it('고객 이력: 가입·예약·취소·환불·쿠폰·알림 동의를 최신 순으로, 다른 고객 것은 빼고, before보다 앞선 것만', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { userId, customerId } = await createTestCustomer(tx);
      await tx
        .update(customers)
        .set({ createdAt: at('2026-10-01T00:00:00Z') })
        .where(eq(customers.id, customerId));
      const someoneElse = await createTestCustomer(tx);

      const booked = await createTestReservation(
        tx,
        shop,
        customerId,
        '10:00',
        '11:00',
        'cancelled',
        {
          createdAt: at('2026-10-20T00:00:00Z'),
          cancelledAt: at('2026-10-25T00:00:00Z'),
          cancelActor: 'customer',
        },
      );
      await tx.insert(refunds).values({
        orderId: booked.order.id,
        reservationId: booked.reservation.id,
        reason: 'customer_cancel',
        status: 'done',
        band: 'over_24h',
        penaltyRate: 30,
        refundAmount: 16_415,
        penaltyAmount: 7_035,
        processedAt: at('2026-10-25T00:05:00Z'),
      });
      await createTestReservation(tx, shop, someoneElse.customerId, '12:00', '13:00', 'confirmed', {
        createdAt: at('2026-10-21T00:00:00Z'),
      });
      const [coupon] = await tx
        .insert(coupons)
        .values({
          customerId,
          amount: 3_000,
          reason: 'owner_fault_compensation',
          issuedAt: at('2026-10-26T00:00:00Z'),
          expiresAt: at('2027-01-24T00:00:00Z'),
        })
        .returning({ id: coupons.id });
      // 쿠폰을 쓴 예약(쿠폰 사용은 결제 시각)
      const withCoupon = await createTestReservation(
        tx,
        shop,
        customerId,
        '14:00',
        '15:00',
        'confirmed',
        {
          createdAt: at('2026-10-27T00:00:01Z'),
        },
      );
      await putCouponOn(tx, withCoupon.order.id, coupon.id, at('2026-10-27T00:00:00Z'));
      await tx.insert(termsAgreements).values({
        userId,
        accountType: 'customer',
        termsType: 'marketing',
        version: 'test',
        agreedAt: at('2026-10-02T00:00:00Z'),
        withdrawnAt: at('2026-10-29T00:00:00Z'),
      });

      const read = (before: Date) =>
        readCustomerHistory(tx, { customerId, userId, from: null, before, kinds: null, take: 30 });
      const kinds = async (before: Date) =>
        toHistoryPage(await read(before), 1, 30).events.map((event) => event.kind);
      expect(await kinds(BEFORE)).toEqual([
        'consent_withdrawn',
        'reservation_created',
        'coupon_used',
        'coupon_issued',
        'refund_done',
        'reservation_cancelled',
        'reservation_created',
        'consent_agreed',
        'signed_up',
      ]);
      expect(await kinds(at('2026-10-26T00:00:00Z'))).toEqual([
        'refund_done',
        'reservation_cancelled',
        'reservation_created',
        'consent_agreed',
        'signed_up',
      ]);

      const [refund] = (await read(BEFORE))
        .flatMap((list) => list.events)
        .filter((event) => event.kind === 'refund_done');
      expect(refund).toMatchObject({
        reservationCode: booked.reservation.code,
        amount: 16_415,
        reason: 'customer_cancel',
      });
    });
  });

  it('고객 쿠폰 사용: 쿠폰을 쓴 예약마다 결제 시각에 한 줄. 돌려받아도 남고, 다시 쓰면 한 줄 더', async () => {
    await withRollback(async (tx) => {
      const story = await seedCouponStory(tx);
      const page = await readCoupons(tx, story, ['coupon_used'], BEFORE);
      expect(page.events.map((event) => event.reservationId)).toEqual([
        story.refunding.reservation.id,
        story.voidedAfterOwner.reservation.id,
        story.voidedAfterCustomer.reservation.id,
        story.reused.reservation.id,
        story.returnedByOwner.reservation.id,
      ]);
      expect(page.total).toBe(5);
      expect(page.events[0]).toMatchObject({
        kind: 'coupon_used',
        at: at('2026-10-23T00:00:00Z').toISOString(),
        reservationCode: story.refunding.reservation.code,
        menuName: story.refunding.slot.menuName,
        startAt: story.refunding.slot.startAt.toISOString(),
        amount: 3_000,
      });

      // 기간(before)으로 고르면 그 전 것만 읽고 센다
      const earlier = await readCoupons(tx, story, ['coupon_used'], at('2026-10-15T00:00:00Z'));
      expect(earlier.events.map((event) => event.reservationId)).toEqual([
        story.reused.reservation.id,
        story.returnedByOwner.reservation.id,
      ]);
      expect(earlier.total).toBe(2);
    });
  });

  it('고객 쿠폰 돌려받음: 원장님 사정 취소는 환불을 끝낸 시각, 무효는 무효로 한 시각에 예약마다 한 번', async () => {
    await withRollback(async (tx) => {
      const story = await seedCouponStory(tx);
      const page = await readCoupons(tx, story, ['coupon_returned'], BEFORE);
      expect(page.events.map((event) => [event.reservationId, event.reason, event.at])).toEqual([
        [
          story.voidedAfterOwner.reservation.id,
          'owner_fault',
          at('2026-10-20T00:01:00Z').toISOString(),
        ],
        [
          story.voidedAfterCustomer.reservation.id,
          'void',
          at('2026-10-18T00:00:00Z').toISOString(),
        ],
        [
          story.returnedByOwner.reservation.id,
          'owner_fault',
          at('2026-10-12T00:01:00Z').toISOString(),
        ],
      ]);
      expect(page.total).toBe(3);
      expect(page.events[0]).toMatchObject({
        kind: 'coupon_returned',
        reservationCode: story.voidedAfterOwner.reservation.code,
        amount: 3_000,
      });
    });
  });
});
