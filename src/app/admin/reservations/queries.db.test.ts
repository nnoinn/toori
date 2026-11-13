// 매물·예약 조회(A-103)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 상태 거르기, 확인 필요, 검색, 계산한 매물 상태, 예약 상세를 본다. 시드와 섞이지 않게 내가 만든 줄만 비교한다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { customers, disputes, refunds, shops, slots, slotWindows } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  testSlot,
} from '../../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../../tests/db/test-db';
import { selectReservationDetail, selectReservations, selectSlots } from './queries';

const unique = (prefix: string) => `${prefix}${crypto.randomUUID().slice(0, 8)}`;
/** testSlot의 시작(2026-11-01)보다 앞 */
const BEFORE_START = new Date('2026-10-31T00:00:00+09:00');
const AFTER_START = new Date('2026-11-02T00:00:00+09:00');

describeDb('매물·예약 조회 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('예약을 상태와 확인 필요로 거른다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const make = (start: string, end: string, status: 'confirmed' | 'completed' | 'cancelled') =>
        createTestReservation(tx, shop, customerId, start, end, status);
      const confirmed = await make('10:00', '11:00', 'confirmed');
      const cancelled = await make('11:00', '12:00', 'cancelled');
      const visited = await createTestReservation(
        tx,
        shop,
        customerId,
        '12:00',
        '13:00',
        'completed',
        { visitResult: 'visited' },
      );
      const noShow = await createTestReservation(
        tx,
        shop,
        customerId,
        '13:00',
        '14:00',
        'completed',
        { visitResult: 'no_show' },
      );
      await tx.insert(refunds).values({
        orderId: cancelled.order.id,
        reservationId: cancelled.reservation.id,
        reason: 'customer_cancel',
        status: 'done',
        band: 'over_24h',
        penaltyRate: 30,
        refundAmount: 9_800,
        penaltyAmount: 4_200,
        reviewReason: '확인해 주세요',
        processedAt: BEFORE_START,
      });

      const mine = new Set(
        [confirmed, cancelled, visited, noShow].map(({ reservation }) => reservation.id),
      );
      const ids = async (filter: Parameters<typeof selectReservations>[1]['filter']) =>
        (await selectReservations(tx, { filter, query: '' })).rows
          .map((row) => row.reservationId)
          .filter((id) => mine.has(id));

      expect(await ids('confirmed')).toEqual([confirmed.reservation.id]);
      expect(await ids('cancelled')).toEqual([cancelled.reservation.id]);
      expect(await ids('completed')).toEqual([visited.reservation.id]);
      expect(await ids('no_show')).toEqual([noShow.reservation.id]);
      expect(await ids('review')).toEqual([cancelled.reservation.id]);
      // 시작 시각이 늦은 순서
      expect(await ids('all')).toEqual([
        noShow.reservation.id,
        visited.reservation.id,
        cancelled.reservation.id,
        confirmed.reservation.id,
      ]);

      const { rows } = await selectReservations(tx, { filter: 'all', query: '' });
      const flag = (id: string) => rows.find((row) => row.reservationId === id)?.needsReview;
      expect(flag(cancelled.reservation.id)).toBe(true);
      expect(flag(confirmed.reservation.id)).toBe(false);
    });
  });

  it('예약을 예약번호·샵 이름·고객 닉네임 일부로 찾고, % 는 글자 그대로 찾는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const { reservation } = await createTestReservation(
        tx,
        shop,
        customerId,
        '10:00',
        '11:00',
        'confirmed',
      );
      const shopName = unique('찾는샵');
      const nickname = unique('찾는고객');
      await tx.update(shops).set({ name: shopName }).where(eq(shops.id, shop.shopId));
      await tx.update(customers).set({ nickname }).where(eq(customers.id, customerId));

      for (const query of [reservation.code.toLowerCase(), shopName, nickname]) {
        const { rows } = await selectReservations(tx, { filter: 'all', query });
        expect(rows.map((row) => row.reservationId)).toEqual([reservation.id]);
        expect(rows[0]).toMatchObject({
          code: reservation.code,
          shopName,
          customerNickname: nickname,
          menuName: '커트',
          amount: 14_000,
          needsReview: false,
        });
      }
      const { rows } = await selectReservations(tx, { filter: 'all', query: `%${unique('없음')}` });
      expect(rows).toEqual([]);
    });
  });

  it('매물은 지금 시각으로 계산한 상태로 거른다(팔리지 않고 시작이 지나면 마감)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const menuName = unique('메뉴');
      const [slot] = await tx
        .insert(slots)
        .values(testSlot(shop, '10:00', '11:00', { menuName }))
        .returning();
      const ids = async (filter: Parameters<typeof selectSlots>[1]['filter'], now: Date) =>
        (await selectSlots(tx, { filter, query: menuName, now })).rows.map((row) => row.slotId);

      expect(await ids('published', BEFORE_START)).toEqual([slot.id]);
      expect(await ids('closed', BEFORE_START)).toEqual([]);
      expect(await ids('published', AFTER_START)).toEqual([]);
      expect(await ids('closed', AFTER_START)).toEqual([slot.id]);
      expect(await ids('all', AFTER_START)).toEqual([slot.id]);

      const {
        rows: [row],
      } = await selectSlots(tx, { filter: 'all', query: menuName, now: BEFORE_START });
      expect(row).toMatchObject({
        shopId: shop.shopId,
        listPrice: 20_000,
        discountRate: 30,
        salePrice: 14_000,
        status: 'published',
        holdCustomerId: null,
      });
    });
  });

  it('결제 없이 비운 시간대 칸(hold_released)은 어느 상태로 걸러도 보이지 않고, 다른 사유로 마감한 매물은 보인다(#308 ④)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const menuName = unique('메뉴');
      const closed = { menuName, status: 'closed' as const, closedAt: BEFORE_START };
      const [, mistake] = await tx
        .insert(slots)
        .values([
          testSlot(shop, '10:00', '11:00', { ...closed, closeReason: 'hold_released' }),
          testSlot(shop, '12:00', '13:00', { ...closed, closeReason: 'mistake' }),
        ])
        .returning();
      for (const filter of ['all', 'closed'] as const) {
        const { rows } = await selectSlots(tx, { filter, query: menuName, now: BEFORE_START });
        expect(rows.map((row) => row.slotId)).toEqual([mistake.id]);
      }
    });
  });

  it('손님이 결제 중인 시간대 칸(아직 예약 전)은 보이지 않고, 결제가 끝난 시간대 칸은 보인다(#308 ③)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const menuName = unique('시간대');
      const [window] = await tx
        .insert(slotWindows)
        .values({
          shopId: shop.shopId,
          startAt: new Date('2026-11-01T13:00:00+09:00'),
          endAt: new Date('2026-11-01T18:00:00+09:00'),
          publishAt: new Date('2026-10-30T10:00:00+09:00'),
          status: 'published',
          createdBy: shop.createdBy,
        })
        .returning({ id: slotWindows.id });
      const [, reserved] = await tx
        .insert(slots)
        .values([
          testSlot(shop, '13:00', '14:00', { menuName, windowId: window.id }),
          testSlot(shop, '14:00', '15:00', { menuName, windowId: window.id, status: 'reserved' }),
        ])
        .returning();
      const { rows } = await selectSlots(tx, { filter: 'all', query: menuName, now: BEFORE_START });
      expect(rows.map((row) => row.slotId)).toEqual([reserved.id]);
    });
  });

  it('예약 상세는 결제와 환불 기록을 읽고, 없는 예약은 null', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const { reservation, order } = await createTestReservation(
        tx,
        shop,
        customerId,
        '10:00',
        '11:00',
        'cancelled',
        { cancelActor: 'customer', hoursBeforeStartAtCancel: 30 },
      );
      await tx.insert(refunds).values({
        orderId: order.id,
        reservationId: reservation.id,
        reason: 'customer_cancel',
        status: 'done',
        band: 'over_24h',
        penaltyRate: 30,
        refundAmount: 9_800,
        penaltyAmount: 4_200,
        pgCancellationId: 'c-1',
        reviewReason: '금액이 달라요',
        processedAt: BEFORE_START,
      });

      expect(await selectReservationDetail(tx, reservation.id)).toMatchObject({
        code: reservation.code,
        status: 'cancelled',
        cancelActor: 'customer',
        hoursBeforeStartAtCancel: 30,
        customerNickname: '테스트 고객',
        shopId: shop.shopId,
        menuName: '커트',
        paymentId: order.paymentId,
        orderStatus: 'confirmed',
        salePrice: 14_000,
        couponAmount: 0,
        amount: 14_000,
        refunds: [
          {
            reason: 'customer_cancel',
            status: 'done',
            band: 'over_24h',
            penaltyRate: 30,
            refundAmount: 9_800,
            penaltyAmount: 4_200,
            pgCancellationId: 'c-1',
            reviewReason: '금액이 달라요',
            processedAt: BEFORE_START,
          },
        ],
        dispute: null,
      });
      expect(await selectReservationDetail(tx, crypto.randomUUID())).toBeNull();
    });
  });

  it('예약 상세는 그 예약의 이의제기(있으면 id·상태·결론)를 같이 읽는다(A-104, 이의제기 등록 버튼 대신 그 상세로)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const { reservation } = await createTestReservation(
        tx,
        shop,
        customerId,
        '10:00',
        '11:00',
        'completed',
        { visitResult: 'visited', visitRecordedAt: BEFORE_START },
      );
      const [dispute] = await tx
        .insert(disputes)
        .values({
          reservationId: reservation.id,
          type: 'after_start',
          content: '시술이 약속과 달랐어요',
          status: 'open',
          channel: 'app',
          receivedAt: BEFORE_START,
        })
        .returning({ id: disputes.id });
      expect((await selectReservationDetail(tx, reservation.id))?.dispute).toEqual({
        disputeId: dispute.id,
        status: 'open',
        outcome: null,
      });
    });
  });
});
