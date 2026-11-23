// 매물·예약 조회(A-103)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 상태 거르기, 확인 필요, 검색, 계산한 매물 상태, 예약 상세, 매물 상세를 본다. 시드와 섞이지 않게 내가 만든 줄만 비교한다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import {
  adminActions,
  adminProfiles,
  customers,
  disputes,
  refunds,
  settlementItems,
  settlements,
  shops,
  slots,
  slotWindows,
} from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  createTestUser,
  testSlot,
} from '../../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../../tests/db/test-db';
import {
  selectReservationDetail,
  selectReservations,
  selectSlotDetail,
  selectSlots,
} from './queries';

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
        (await selectReservations(tx, { filter, query: '', sort: 'start_late' })).rows
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

  it('예약 목록 정렬: 기본은 예약한 시각이 늦은 순이고, 오래된 예약·서비스 일시 빠른·늦은 순으로도 고른다(#360 1번)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const booked = (iso: string) => ({ createdAt: new Date(iso) });
      // 서비스 일시: a < b < c, 예약한 시각: c < a < b
      const a = await createTestReservation(
        tx,
        shop,
        customerId,
        '10:00',
        '11:00',
        'confirmed',
        booked('2026-10-30T09:00:00+09:00'),
      );
      const b = await createTestReservation(
        tx,
        shop,
        customerId,
        '11:00',
        '12:00',
        'confirmed',
        booked('2026-10-30T12:00:00+09:00'),
      );
      const c = await createTestReservation(
        tx,
        shop,
        customerId,
        '12:00',
        '13:00',
        'confirmed',
        booked('2026-10-29T18:00:00+09:00'),
      );
      const mine = new Set([a, b, c].map(({ reservation }) => reservation.id));
      const order = async (sort?: Parameters<typeof selectReservations>[1]['sort']) =>
        (await selectReservations(tx, { filter: 'all', query: '', sort })).rows
          .map((row) => row.reservationId)
          .filter((id) => mine.has(id));
      const [ida, idb, idc] = [a, b, c].map(({ reservation }) => reservation.id);

      expect(await order()).toEqual([idb, ida, idc]);
      expect(await order('latest')).toEqual([idb, ida, idc]);
      expect(await order('oldest')).toEqual([idc, ida, idb]);
      expect(await order('start_soon')).toEqual([ida, idb, idc]);
      expect(await order('start_late')).toEqual([idc, idb, ida]);

      const { rows } = await selectReservations(tx, { filter: 'all', query: '' });
      expect(rows.find((row) => row.reservationId === ida)?.bookedAt).toEqual(
        new Date('2026-10-30T09:00:00+09:00'),
      );
    });
  });

  it('예약을 예약번호·샵 이름·고객 이름·닉네임 일부로 찾고(원장님이 보는 예약자 이름으로도), % 는 글자 그대로 찾는다', async () => {
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
      const name = unique('찾는이름');
      await tx.update(shops).set({ name: shopName }).where(eq(shops.id, shop.shopId));
      await tx.update(customers).set({ name, nickname }).where(eq(customers.id, customerId));

      for (const query of [reservation.code.toLowerCase(), shopName, nickname, name]) {
        const { rows } = await selectReservations(tx, { filter: 'all', query });
        expect(rows.map((row) => row.reservationId)).toEqual([reservation.id]);
        expect(rows[0]).toMatchObject({
          code: reservation.code,
          shopName,
          customerName: name,
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

  it('예약 상세는 고객 이름(원장님이 보는 예약자 이름)·결제·환불 기록을 읽고, 없는 예약은 null', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      await tx.update(customers).set({ name: '테스트 박세나' }).where(eq(customers.id, customerId));
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
        customerId,
        customerName: '테스트 박세나',
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

  it('예약 상세는 정산에 묶였는지(그 주문의 정산 줄이 있는지)를 같이 읽는다(#373 ③, 묶인 뒤에는 노쇼를 되돌리지 않는다)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const made = await createTestReservation(
        tx,
        shop,
        customerId,
        '10:00',
        '11:00',
        'completed',
        {
          visitResult: 'no_show',
          visitRecordedAt: BEFORE_START,
        },
      );
      const other = await createTestReservation(
        tx,
        shop,
        customerId,
        '11:00',
        '12:00',
        'completed',
        {
          visitResult: 'visited',
          visitRecordedAt: BEFORE_START,
        },
      );
      expect((await selectReservationDetail(tx, made.reservation.id))?.settlementBundled).toBe(
        false,
      );

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
        .returning({ id: settlements.id });
      await tx.insert(settlementItems).values({
        shopId: shop.shopId,
        orderId: made.order.id,
        kind: 'no_show',
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
      expect((await selectReservationDetail(tx, made.reservation.id))?.settlementBundled).toBe(
        true,
      );
      // 같은 샵의 다른 예약은 묶이지 않았다
      expect((await selectReservationDetail(tx, other.reservation.id))?.settlementBundled).toBe(
        false,
      );
    });
  });

  it('매물 상세는 매물 내용·샵·이 매물의 예약·이 매물의 운영자 처리 기록(최근 것부터)을 읽고, 없는 매물은 null(11/19 피드백)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const made = await createTestReservation(tx, shop, customerId, '10:00', '11:00', 'confirmed');
      const other = await createTestReservation(
        tx,
        shop,
        customerId,
        '11:00',
        '12:00',
        'confirmed',
      );
      const named = await createTestUser(tx);
      const unnamed = await createTestUser(tx);
      await tx.insert(adminProfiles).values({ userId: named, name: unique('운영자') });
      const at = (hm: string) => new Date(`2026-10-31T${hm}:00+09:00`);
      const action = (
        adminId: string,
        targetType: string,
        targetId: string,
        memo: string,
        createdAt: Date,
      ) => ({ adminId, action: 'slot.force_close', targetType, targetId, memo, createdAt });
      await tx.insert(adminActions).values([
        action(named, 'slot', made.slot.id, '먼저 남긴 기록', at('09:00')),
        action(unnamed, 'slot', made.slot.id, '나중에 남긴 기록', at('10:00')),
        // 다른 매물, 같은 id의 다른 대상 종류는 넣지 않는다
        action(named, 'slot', other.slot.id, '다른 매물', at('11:00')),
        action(named, 'reservation', made.slot.id, '다른 대상 종류', at('12:00')),
      ]);

      const detail = await selectSlotDetail(tx, made.slot.id);
      expect(detail).toMatchObject({
        slotId: made.slot.id,
        shopId: shop.shopId,
        menuName: made.slot.menuName,
        serviceType: made.slot.serviceType,
        startAt: made.slot.startAt,
        endAt: made.slot.endAt,
        durationMinutes: 60,
        listPrice: made.slot.listPrice,
        discountRate: made.slot.discountRate,
        salePrice: made.slot.salePrice,
        status: 'reserved',
        windowId: null,
        relistedFromSlotId: null,
        closedAt: null,
        closeReason: null,
      });
      expect(detail?.reservations).toEqual([
        {
          reservationId: made.reservation.id,
          code: made.reservation.code,
          status: 'confirmed',
          visitResult: null,
          bookedAt: made.reservation.createdAt,
        },
      ]);
      const [named_] = await tx
        .select({ name: adminProfiles.name })
        .from(adminProfiles)
        .where(eq(adminProfiles.userId, named));
      expect(detail?.adminActions).toEqual([
        { action: 'slot.force_close', memo: '나중에 남긴 기록', at: at('10:00'), adminName: null },
        {
          action: 'slot.force_close',
          memo: '먼저 남긴 기록',
          at: at('09:00'),
          adminName: named_.name,
        },
      ]);
      expect(await selectSlotDetail(tx, crypto.randomUUID())).toBeNull();
    });
  });

  it('매물 상세는 목록에서 빼는 매물(결제 없이 비운 시간대 칸)과 재등록 매물도 주소로 읽는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
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
      const closedAt = new Date('2026-10-31T10:10:00+09:00');
      const [released, original] = await tx
        .insert(slots)
        .values([
          testSlot(shop, '13:00', '14:00', {
            windowId: window.id,
            status: 'closed',
            closedAt,
            closeReason: 'hold_released',
          }),
          testSlot(shop, '09:00', '10:00', { status: 'cancelled' }),
        ])
        .returning();
      const [relisted] = await tx
        .insert(slots)
        .values(testSlot(shop, '09:00', '10:00', { relistedFromSlotId: original.id }))
        .returning();

      expect(await selectSlotDetail(tx, released.id)).toMatchObject({
        windowId: window.id,
        status: 'closed',
        closedAt,
        closeReason: 'hold_released',
        reservations: [],
        adminActions: [],
      });
      expect(await selectSlotDetail(tx, relisted.id)).toMatchObject({
        relistedFromSlotId: original.id,
        windowId: null,
      });
    });
  });
});
