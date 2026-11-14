// 계정 이력 DB 읽기(#374)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 원장님 이력은 그 샵 것만(다른 샵·손님이 시간대 안에서 만든 칸은 빼고), 고객 이력은 그 고객 것만 최신 순으로 읽는지 본다.
// 테스트 데이터는 한 트랜잭션이라 기본 시각(now())이 같아서, 비교할 기록은 시각을 직접 넣고 before로 그 뒤 기록은 뺀다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import {
  coupons,
  customers,
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
import { closeTestDb, describeDb, withRollback } from '../../../tests/db/test-db';
import { type HistoryReader, readHistoryPage, toHistoryPage } from './history-page';
import { readCustomerHistory, readOwnerHistory, readOwnerShopId } from './history-store';

const at = (iso: string) => new Date(iso);
/** 이 시각 뒤에 생긴 기록(테스트가 시각을 넣지 않은 것)은 보지 않는다 */
const BEFORE = at('2026-11-01T00:00:00Z');

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

      const lists = await readOwnerHistory(tx, {
        shopId: shop.shopId,
        before: BEFORE,
        limit: 30,
        now: at('2026-11-14T00:00:00Z'),
      });
      const page = toHistoryPage(lists, 30);
      expect(page.events.map((event) => event.key)).toEqual([
        expect.stringMatching(/^payout_account_changed:/),
        `reservation_cancelled:${booked.reservation.id}`,
        `reservation_created:${booked.reservation.id}`,
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
      expect(page.events[4]).toMatchObject({ kind: 'slot_closed', reason: 'other_channel' });
    });
  });

  it('한 번에 만든 매물이 한 쪽 줄 수보다 많아도 [더보기]로 넘길 때 빠지지 않는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, {
        status: 'approved',
        appliedAt: at('2026-10-01T00:00:00Z'),
      });
      // 등록 시각이 같은 매물 4개. 한 쪽 2줄이면 처음 읽기(기록마다 3개)에서 하나가 빠지므로 그 시각만 다시 읽어야 한다
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
      const read: HistoryReader = (range) =>
        readOwnerHistory(tx, { shopId: shop.shopId, ...range, now: at('2026-11-14T00:00:00Z') });

      const first = await readHistoryPage(read, BEFORE, 2);
      expect(first.events.map((event) => event.key).sort()).toEqual(
        made.map((slot) => `slot_created:${slot.id}`).sort(),
      );
      expect(first.nextBefore).toBe(sameTime.toISOString());

      const second = await readHistoryPage(read, new Date(first.nextBefore as string), 2);
      expect(second.events.map((event) => event.key)).toEqual([`shop_applied:${shop.shopId}`]);
      expect(second.nextBefore).toBeNull();
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
      await tx.insert(coupons).values({
        customerId,
        amount: 3_000,
        reason: 'owner_fault_compensation',
        issuedAt: at('2026-10-26T00:00:00Z'),
        expiresAt: at('2027-01-24T00:00:00Z'),
        usedAt: at('2026-10-27T00:00:00Z'),
      });
      await tx.insert(termsAgreements).values({
        userId,
        accountType: 'customer',
        termsType: 'marketing',
        version: 'test',
        agreedAt: at('2026-10-02T00:00:00Z'),
        withdrawnAt: at('2026-10-29T00:00:00Z'),
      });

      const kinds = async (before: Date) =>
        toHistoryPage(
          await readCustomerHistory(tx, { customerId, userId, before, limit: 30 }),
          30,
        ).events.map((event) => event.kind);
      expect(await kinds(BEFORE)).toEqual([
        'consent_withdrawn',
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

      const [refund] = (
        await readCustomerHistory(tx, { customerId, userId, before: BEFORE, limit: 30 })
      )
        .flat()
        .filter((event) => event.kind === 'refund_done');
      expect(refund).toMatchObject({
        reservationCode: booked.reservation.code,
        amount: 16_415,
        reason: 'customer_cancel',
      });
    });
  });
});
