// 주간 매물 등록 권유(S-411)가 그 샵의 지난 4주 판매와 이번 주 매물만 보고 권하는지 실제 DB로 본다.
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { menus, orders, reservations, slots, slotWindows } from '@/db/schema';
import type { ReservationStatus } from '@/db/schema/payments';
import type { BusinessHours } from '@/db/schema/shops';
import { addMinutes } from '@/lib/time';

import {
  createTestCustomer,
  createTestShop,
  type TestShop,
  testSlot,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import { selectSoldSlots, suggestWeeklySlots } from './weekly-suggest-store';

afterAll(closeTestDb);

const kst = (value: string) => new Date(`${value.replace(' ', 'T')}:00+09:00`);

/** 2026-11-30(월) 오전 10시. 지난 4주는 11-02(월) 0시 ~ 11-30(월) 0시 */
const NOW = kst('2026-11-30 10:00');

const SLOT_STATUS_OF = {
  confirmed: 'reserved',
  completed: 'completed',
  cancelled: 'cancelled',
} as const;

/** 매일 10:00 ~ 20:00 */
const DAILY_10_TO_20: BusinessHours = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  open: '10:00',
  close: '20:00',
}));

/** start(한국 시각)에 시작하는 60분 매물을 만들고 예약까지 한 벌 넣는다 */
async function sell(
  tx: TestTx,
  shop: TestShop,
  customerId: string,
  start: string,
  status: ReservationStatus = 'completed',
  reservation: Partial<typeof reservations.$inferInsert> = {},
  slot: Partial<typeof slots.$inferInsert> = {},
) {
  const startAt = kst(start);
  const [row] = await tx
    .insert(slots)
    .values(
      testSlot(shop, '10:00', '11:00', {
        startAt,
        endAt: addMinutes(startAt, 60),
        status: SLOT_STATUS_OF[status],
        ...slot,
      }),
    )
    .returning();
  const [order] = await tx
    .insert(orders)
    .values({
      paymentId: `test_${crypto.randomUUID()}`,
      slotId: row.id,
      customerId,
      salePrice: row.salePrice,
      amount: row.salePrice,
      refundPolicyVersion: 'test',
      refundPolicyAgreedAt: kst('2026-11-01 10:00'),
      status: 'confirmed',
      paidAt: kst('2026-11-01 10:05'),
    })
    .returning();
  await tx.insert(reservations).values({
    code: `T${crypto.randomUUID().slice(0, 8)}`,
    slotId: row.id,
    orderId: order.id,
    customerId,
    status,
    ...reservation,
  });
  return row;
}

const startsOf = (rows: { startAt: Date }[]) => rows.map((row) => row.startAt.toISOString()).sort();

describeDb('주간 매물 등록 권유 조회 (실제 DB)', () => {
  it('판매: 예약 확정·이용 완료·노쇼는 세고, 취소·무효는 세지 않는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      await sell(tx, shop, customerId, '2026-11-24 14:00', 'confirmed');
      await sell(tx, shop, customerId, '2026-11-17 14:00', 'completed', { visitResult: 'visited' });
      await sell(tx, shop, customerId, '2026-11-10 14:00', 'completed', { visitResult: 'no_show' });
      await sell(tx, shop, customerId, '2026-11-12 14:00', 'cancelled', {
        cancelledAt: kst('2026-11-11 10:00'),
        cancelActor: 'customer',
      });
      await sell(tx, shop, customerId, '2026-11-13 14:00', 'completed', {
        visitResult: 'visited',
        voidedAt: kst('2026-11-14 10:00'),
      });

      expect(startsOf(await selectSoldSlots(tx, shop.shopId, NOW))).toEqual(
        startsOf([
          { startAt: kst('2026-11-24 14:00') },
          { startAt: kst('2026-11-17 14:00') },
          { startAt: kst('2026-11-10 14:00') },
        ]),
      );
    });
  });

  it('판매: 지난 4주 밖·이번 주·다른 샵 판매와 팔리지 않은 매물은 세지 않는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const other = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      await sell(tx, shop, customerId, '2026-11-01 14:00'); // 4주 전보다 앞(일요일)
      await sell(tx, shop, customerId, '2026-11-02 00:00'); // 4주 첫 순간
      await sell(tx, shop, customerId, '2026-11-29 23:00'); // 지난주 마지막 날
      await sell(tx, shop, customerId, '2026-11-30 08:00'); // 이번 주(지금보다 앞이어도)
      await sell(tx, other, customerId, '2026-11-24 14:00'); // 다른 샵
      await tx.insert(slots).values(
        testSlot(shop, '10:00', '11:00', {
          startAt: kst('2026-11-25 14:00'),
          endAt: kst('2026-11-25 15:00'),
          status: 'completed',
        }),
      ); // 팔리지 않은 매물

      expect(startsOf(await selectSoldSlots(tx, shop.shopId, NOW))).toEqual(
        startsOf([{ startAt: kst('2026-11-02 00:00') }, { startAt: kst('2026-11-29 23:00') }]),
      );
    });
  });

  it('판매: 손님이 시간대 매물 안에서 예약한 매물도 센다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const [window] = await tx
        .insert(slotWindows)
        .values({
          shopId: shop.shopId,
          startAt: kst('2026-11-26 13:00'),
          endAt: kst('2026-11-26 18:00'),
          publishAt: kst('2026-11-24 13:00'),
          status: 'published',
          createdBy: shop.createdBy,
        })
        .returning({ id: slotWindows.id });
      await sell(
        tx,
        shop,
        customerId,
        '2026-11-26 14:00',
        'completed',
        {},
        { windowId: window.id },
      );

      expect(startsOf(await selectSoldSlots(tx, shop.shopId, NOW))).toEqual(
        startsOf([{ startAt: kst('2026-11-26 14:00') }]),
      );
    });
  });

  it('권유: 이번 주 매물·시간대 매물이 있는 날은 빼고, 그 샵 영업시간과 메뉴로 권한다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved', businessHours: DAILY_10_TO_20 });
      const { customerId } = await createTestCustomer(tx);
      await sell(tx, shop, customerId, '2026-11-24 14:00'); // 화 14:00
      await sell(tx, shop, customerId, '2026-11-26 16:00'); // 목 16:00
      await sell(tx, shop, customerId, '2026-11-27 16:00'); // 금 16:00
      await sell(tx, shop, customerId, '2026-11-28 19:30'); // 토 19:30 → 60분이면 20:30이라 영업시간 밖
      // 이번 주 목요일 아침에 올린 매물, 금요일 저녁 시간대 매물
      await tx.insert(slots).values(
        testSlot(shop, '10:00', '11:00', {
          startAt: kst('2026-12-03 10:00'),
          endAt: kst('2026-12-03 11:00'),
          status: 'scheduled',
        }),
      );
      await tx.insert(slotWindows).values({
        shopId: shop.shopId,
        startAt: kst('2026-12-04 17:00'),
        endAt: kst('2026-12-04 20:00'),
        publishAt: kst('2026-12-02 17:00'),
        status: 'scheduled',
        createdBy: shop.createdBy,
      });

      expect(await suggestWeeklySlots(tx, { shopId: shop.shopId, now: NOW })).toEqual({
        status: 'suggested',
        weekStart: '2026-11-30',
        items: [
          {
            date: '2026-12-01',
            startTime: '14:00',
            menuId: shop.menuId,
            discountRate: 30,
            newCustomerOnly: false,
          },
        ],
      });
    });
  });

  it('권유: 판매가 없거나 숨긴 메뉴만 팔렸으면 no_history, 마감 매물만 있는 날은 권하고, 모두 빠지면 nothing_to_suggest', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved', businessHours: DAILY_10_TO_20 });
      const { customerId } = await createTestCustomer(tx);
      expect(await suggestWeeklySlots(tx, { shopId: shop.shopId, now: NOW })).toEqual({
        status: 'no_history',
      });

      await sell(tx, shop, customerId, '2026-11-24 14:00');
      // 화요일에 마감한 매물만 있으면 빈 날짜로 보고 권한다
      await tx.insert(slots).values(
        testSlot(shop, '10:00', '11:00', {
          startAt: kst('2026-12-01 11:00'),
          endAt: kst('2026-12-01 12:00'),
          status: 'closed',
          closedAt: NOW,
          closeReason: 'mistake',
        }),
      );
      expect(await suggestWeeklySlots(tx, { shopId: shop.shopId, now: NOW })).toMatchObject({
        status: 'suggested',
        items: [{ date: '2026-12-01', startTime: '14:00' }],
      });

      // 화요일에 게시중 매물을 올리면 권할 날이 없다
      await tx.insert(slots).values(
        testSlot(shop, '10:00', '11:00', {
          startAt: kst('2026-12-01 18:00'),
          endAt: kst('2026-12-01 19:00'),
          status: 'published',
        }),
      );
      expect(await suggestWeeklySlots(tx, { shopId: shop.shopId, now: NOW })).toEqual({
        status: 'nothing_to_suggest',
      });

      await tx.update(menus).set({ hiddenAt: NOW }).where(eq(menus.id, shop.menuId));
      expect(await suggestWeeklySlots(tx, { shopId: shop.shopId, now: NOW })).toEqual({
        status: 'no_history',
      });
    });
  });
});
