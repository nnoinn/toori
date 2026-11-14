// 원장님 대시보드 조회가 그 샵의 오늘 이후 매물과 "처리 필요" 예약만 고르는지 실제 DB로 본다(O9, S-401, #21 Q12).
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { afterAll, expect, it } from 'vitest';

import { slots, slotWindowMenus, slotWindows } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  type TestShop,
  testSlot,
} from '../../../../../tests/db/fixtures';
import {
  closeTestDb,
  describeDb,
  type TestTx,
  withRollback,
} from '../../../../../tests/db/test-db';
import {
  selectDashboardSlots,
  selectDashboardWindows,
  selectNeedsVisitRecord,
} from './dashboard-store';

afterAll(closeTestDb);

// 매물 날짜는 2026-11-01(testSlot). 그날 0시부터 본다
const from = new Date('2026-11-01T00:00:00+09:00');

/** 'YYYY-MM-DD HH:MM'(한국 시간) */
const kst = (value: string) => new Date(`${value.replace(' ', 'T')}:00+09:00`);

/** 시간대 한 줄과 그 샵 메뉴(커트 20,000원 60분) 서비스 하나를 바로 넣는다(#308) */
async function addWindow(
  tx: TestTx,
  shop: TestShop,
  start: string,
  end: string,
  extra: Partial<typeof slotWindows.$inferInsert> = {},
  discountRate = 30,
) {
  const [row] = await tx
    .insert(slotWindows)
    .values({
      shopId: shop.shopId,
      startAt: kst(start),
      endAt: kst(end),
      publishAt: kst('2026-10-31 08:00'),
      status: 'published',
      createdBy: shop.createdBy,
      ...extra,
    })
    .returning({ id: slotWindows.id });
  await tx.insert(slotWindowMenus).values({
    windowId: row.id,
    menuId: shop.menuId,
    serviceType: 'cut',
    menuName: '커트',
    listPrice: 20000,
    durationMinutes: 60,
    discountRate,
    salePrice: 20000 * (1 - discountRate / 100),
  });
  return row.id;
}

describeDb('원장님 대시보드 조회 (실제 DB)', () => {
  it('그 샵의 from 이후 매물을 시작 순서로, 예약된 매물은 예약 id·예약번호와 같이', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const other = await createTestShop(tx);
      const customer = await createTestCustomer(tx);
      await tx.insert(slots).values([
        testSlot(shop, '15:00', '16:00'),
        testSlot(shop, '09:00', '10:00', { status: 'closed', closeReason: 'mistake' }),
        // 전날 매물: 빠진다
        testSlot(shop, '10:00', '11:00', {
          startAt: new Date('2026-10-31T10:00:00+09:00'),
          endAt: new Date('2026-10-31T11:00:00+09:00'),
        }),
        testSlot(other, '12:00', '13:00'),
      ]);
      const { reservation } = await createTestReservation(
        tx,
        shop,
        customer.customerId,
        '11:00',
        '12:00',
        'confirmed',
      );

      const rows = await selectDashboardSlots(tx, shop.shopId, from);
      expect(
        rows.map((row) => [row.startAt, row.status, row.reservationId, row.reservationCode]),
      ).toEqual([
        [new Date('2026-11-01T09:00:00+09:00').toISOString(), 'closed', null, null],
        [
          new Date('2026-11-01T11:00:00+09:00').toISOString(),
          'reserved',
          reservation.id,
          reservation.code,
        ],
        [new Date('2026-11-01T15:00:00+09:00').toISOString(), 'published', null, null],
      ]);
    });
  });

  it('결제 없이 홀딩이 끝나 마감된 매물(hold_released)은 빼고, 다른 사유로 마감한 매물은 남긴다(#308 ④)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      await tx
        .insert(slots)
        .values([
          testSlot(shop, '09:00', '10:00', { status: 'closed', closeReason: 'hold_released' }),
          testSlot(shop, '10:00', '11:00', { status: 'closed', closeReason: 'other_channel' }),
          testSlot(shop, '11:00', '12:00'),
        ]);

      const rows = await selectDashboardSlots(tx, shop.shopId, from);
      expect(rows.map((row) => [row.startAt, row.status, row.closeReason])).toEqual([
        [new Date('2026-11-01T10:00:00+09:00').toISOString(), 'closed', 'other_channel'],
        [new Date('2026-11-01T11:00:00+09:00').toISOString(), 'published', null],
      ]);
    });
  });

  it('시간대 안에서 손님이 결제 중인 칸은 빼고 결제가 끝난 칸은 보인다. 원장님이 올린 매물은 결제 중이어도 보인다(WINDOW-08)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const customer = await createTestCustomer(tx);
      const windowId = await addWindow(tx, shop, '2026-11-01 13:00', '2026-11-01 18:00');
      const hold = {
        holdCustomerId: customer.customerId,
        holdExpiresAt: kst('2026-11-01 09:10'),
      };
      await tx.insert(slots).values([
        // 원장님이 올린 매물: 손님이 결제 중이어도 보인다("다른 고객이 결제 중" 배지)
        testSlot(shop, '09:00', '10:00', hold),
        // 시간대 안: 결제 중인 칸은 빠지고, 결제가 끝난 칸(예약됨)은 보인다
        testSlot(shop, '13:00', '14:00', { windowId, ...hold }),
        testSlot(shop, '15:00', '16:00', { windowId, status: 'reserved' }),
      ]);

      const rows = await selectDashboardSlots(tx, shop.shopId, from);
      expect(rows.map((row) => [row.startAt, row.status, row.windowId])).toEqual([
        [kst('2026-11-01 09:00').toISOString(), 'published', null],
        [kst('2026-11-01 15:00').toISOString(), 'reserved', windowId],
      ]);
    });
  });

  it('재등록한 취소 매물은 새 매물 id를 같이 주고, 줄은 한 번씩만 나온다(O13)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const [cancelled, notRelisted] = await tx
        .insert(slots)
        .values([
          testSlot(shop, '13:00', '14:00', { status: 'cancelled' }),
          testSlot(shop, '16:00', '17:00', { status: 'cancelled' }),
        ])
        .returning({ id: slots.id });
      const [relisted] = await tx
        .insert(slots)
        .values(testSlot(shop, '13:00', '14:00', { relistedFromSlotId: cancelled.id }))
        .returning({ id: slots.id });

      const rows = await selectDashboardSlots(tx, shop.shopId, from);
      expect(rows.map((row) => [row.id, row.status, row.relistedSlotId])).toEqual(
        expect.arrayContaining([
          [cancelled.id, 'cancelled', relisted.id],
          [relisted.id, 'published', null],
          [notRelisted.id, 'cancelled', null],
        ]),
      );
      expect(rows).toHaveLength(3);
    });
  });

  it('시간대 매물: 그 샵의 from 이후 시간대를 시작 순서로 서비스·할인율과 함께, 마감한 시간대는 사유와 같이(#308)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const other = await createTestShop(tx);
      await addWindow(tx, shop, '2026-11-01 13:00', '2026-11-01 15:00');
      await addWindow(
        tx,
        shop,
        '2026-11-01 10:00',
        '2026-11-01 12:00',
        {
          status: 'closed',
          closedAt: kst('2026-10-31 20:00'),
          closeReason: 'mistake',
        },
        20,
      );
      // 전날 시간대, 다른 샵 시간대는 빠진다
      await addWindow(tx, shop, '2026-10-31 13:00', '2026-10-31 15:00');
      await addWindow(tx, other, '2026-11-01 13:00', '2026-11-01 15:00');

      const rows = await selectDashboardWindows(tx, shop.shopId, from, kst('2026-11-01 09:00'));
      expect(
        rows.map((row) => [row.kind, row.startAt, row.state, row.closeReason, row.menus]),
      ).toEqual([
        [
          'window',
          kst('2026-11-01 10:00').toISOString(),
          'closed',
          'mistake',
          [{ name: '커트', discountRate: 20 }],
        ],
        [
          'window',
          kst('2026-11-01 13:00').toISOString(),
          'published',
          null,
          [{ name: '커트', discountRate: 30 }],
        ],
      ]);
    });
  });

  it('시간대 상태: 게시 전이면 예약대기, 남은 시간에 들어가는 서비스가 없으면 full(#308)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      // 10:30 지금, 10:00~11:00에 60분 서비스: 10:00은 지났고 10:30에 시작하면 11:30에 끝나서 넘친다
      await addWindow(tx, shop, '2026-11-01 10:00', '2026-11-01 11:00');
      await addWindow(tx, shop, '2026-11-03 10:00', '2026-11-03 12:00', {
        status: 'scheduled',
        // 게시 시각(12:00)이 지금(10:30)보다 늦다
        publishAt: kst('2026-11-01 12:00'),
      });

      const rows = await selectDashboardWindows(tx, shop.shopId, from, kst('2026-11-01 10:30'));
      expect(rows.map((row) => row.state)).toEqual(['full', 'scheduled']);
    });
  });

  it('마감한 시간대에는 손님이 결제 중이라 남긴 칸을 시작 순서로 같이 준다. 열린 시간대의 결제 중인 칸, 닫힌 칸, 예약된 칸은 넣지 않는다(WINDOW-06)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const customer = await createTestCustomer(tx);
      const closedId = await addWindow(tx, shop, '2026-11-01 10:00', '2026-11-01 15:00', {
        status: 'closed',
        closedAt: kst('2026-11-01 09:00'),
        closeReason: 'mistake',
      });
      const openId = await addWindow(tx, shop, '2026-11-01 16:00', '2026-11-01 18:00');
      const hold = {
        holdCustomerId: customer.customerId,
        holdExpiresAt: kst('2026-11-01 09:10'),
      };
      await tx.insert(slots).values([
        // 마감한 시간대: 결제 중인 두 칸은 남긴 칸(시작 순으로 나와야 해서 늦은 칸을 먼저 넣는다)
        testSlot(shop, '13:00', '14:00', { windowId: closedId, ...hold, menuName: '펌' }),
        testSlot(shop, '10:00', '11:00', { windowId: closedId, ...hold }),
        // 결제 없이 닫힌 칸과 예약된 칸은 남긴 칸이 아니다
        testSlot(shop, '11:00', '12:00', {
          windowId: closedId,
          status: 'closed',
          closedAt: kst('2026-11-01 09:00'),
          closeReason: 'hold_released',
        }),
        testSlot(shop, '12:00', '13:00', { windowId: closedId, status: 'reserved' }),
        // 열린 시간대에서 손님이 결제 중인 칸은 마감 때 남긴 칸이 아니다
        testSlot(shop, '16:00', '17:00', { windowId: openId, ...hold }),
      ]);

      const rows = await selectDashboardWindows(tx, shop.shopId, from, kst('2026-11-01 09:05'));
      expect(rows.map((row) => [row.id, row.keptSlots])).toEqual([
        [
          closedId,
          [
            {
              startAt: kst('2026-11-01 10:00').toISOString(),
              endAt: kst('2026-11-01 11:00').toISOString(),
              menuName: '커트',
            },
            {
              startAt: kst('2026-11-01 13:00').toISOString(),
              endAt: kst('2026-11-01 14:00').toISOString(),
              menuName: '펌',
            },
          ],
        ],
        [openId, []],
      ]);
    });
  });

  it('처리 필요: 시작이 지났고 방문·노쇼 기록이 없는 예정 예약만', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const other = await createTestShop(tx);
      const customer = await createTestCustomer(tx);
      const need = await createTestReservation(
        tx,
        shop,
        customer.customerId,
        '09:00',
        '10:00',
        'confirmed',
      );
      // 방문 완료 기록이 있으면 빠진다
      await createTestReservation(tx, shop, customer.customerId, '10:00', '11:00', 'confirmed', {
        visitResult: 'visited',
        visitRecordedAt: new Date('2026-11-01T11:00:00+09:00'),
      });
      // 취소된 예약, 아직 시작 전 예약, 다른 샵 예약도 빠진다
      await createTestReservation(tx, shop, customer.customerId, '11:00', '12:00', 'cancelled');
      await createTestReservation(tx, shop, customer.customerId, '15:00', '16:00', 'confirmed');
      await createTestReservation(tx, other, customer.customerId, '09:00', '10:00', 'confirmed');

      const now = new Date('2026-11-01T13:00:00+09:00');
      const rows = await selectNeedsVisitRecord(tx, shop.shopId, now);
      expect(rows.map((row) => row.reservationCode)).toEqual([need.reservation.code]);
    });
  });
});
