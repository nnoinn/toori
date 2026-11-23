// 운영자 샵 상세 '매물 관리' 칸 조회(#373 ④, #567 3번)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 올라와 있는 시간대 매물과 판매 전 한 시술 매물을 가까운 것부터 5개씩, 전체 수와 같이 읽는지 본다.

import { afterAll, expect, it } from 'vitest';

import { slots, slotWindows } from '@/db/schema';

import {
  createTestCustomer,
  createTestShop,
  type TestShop,
  testSlot,
} from '../../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../../tests/db/test-db';
import { SHOP_SLOT_CONTROL_LIMIT, selectShopSlotControl } from './slot-control-queries';

const kst = (dateTime: string) => new Date(`${dateTime}+09:00`);
/** 화면을 연 시각. 11/1 매물(10/30 게시)은 게시중이다 */
const NOW = kst('2026-10-31T12:00:00');

async function addWindow(
  tx: TestTx,
  shop: TestShop,
  day: string,
  extra: Partial<typeof slotWindows.$inferInsert> = {},
) {
  const [row] = await tx
    .insert(slotWindows)
    .values({
      shopId: shop.shopId,
      startAt: kst(`${day}T13:00:00`),
      endAt: kst(`${day}T15:00:00`),
      publishAt: kst('2026-10-30T10:00:00'),
      status: 'published',
      createdBy: shop.createdBy,
      ...extra,
    })
    .returning({ id: slotWindows.id });
  return row.id;
}

describeDb('운영자 샵 상세 매물 관리 조회 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('올라와 있는 시간대 매물은 시작이 이른 것부터 5개까지와 전체 수(마감·끝난 것과 다른 샵은 빼고)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const other = await createTestShop(tx, { status: 'approved' });
      // 올라와 있는 시간대 6개(11/2~11/7). 넣는 순서와 상관없이 시작이 이른 것부터
      const open = [];
      for (const day of ['05', '02', '07', '03', '06', '04']) {
        open.push({ day, id: await addWindow(tx, shop, `2026-11-${day}`) });
      }
      // 게시예정(게시 시각 전)도 올라와 있는 것이다
      const scheduled = await addWindow(tx, shop, '2026-11-08', {
        status: 'scheduled',
        publishAt: kst('2026-11-06T10:00:00'),
      });
      // 마감한 것, 이미 끝난 것, 다른 샵 것은 뺀다
      await addWindow(tx, shop, '2026-11-09', {
        status: 'closed',
        closeReason: 'other',
        closedAt: kst('2026-10-31T09:00:00'),
      });
      await addWindow(tx, shop, '2026-10-30');
      await addWindow(tx, other, '2026-11-02');

      const control = await selectShopSlotControl(tx, shop.shopId, NOW);
      const byStart = [...open].sort((a, b) => a.day.localeCompare(b.day)).map((row) => row.id);
      expect(control?.openWindowCount).toBe(7);
      expect(control?.openWindows.map((row) => row.windowId)).toEqual(
        byStart.slice(0, SHOP_SLOT_CONTROL_LIMIT),
      );
      expect(control?.openWindows[0]).toEqual({
        windowId: byStart[0],
        startAt: kst('2026-11-02T13:00:00'),
        endAt: kst('2026-11-02T15:00:00'),
        publishAt: kst('2026-10-30T10:00:00'),
      });
      expect(control?.openWindows.map((row) => row.windowId)).not.toContain(scheduled);
    });
  });

  it('판매 전 한 시술 매물은 시작이 이른 것부터 5개까지와 전체 수. 결제 중인 매물은 넣고, 예약됨·마감·시작한 매물과 시간대 칸은 뺀다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const other = await createTestShop(tx, { status: 'approved' });
      const customer = await createTestCustomer(tx);
      const insert = (start: string, end: string, extra: Partial<typeof slots.$inferInsert> = {}) =>
        tx
          .insert(slots)
          .values(testSlot(shop, start, end, extra))
          .returning({ id: slots.id })
          .then(([row]) => row.id);

      // 판매 전 6개: 게시중 다섯(하나는 손님이 결제 중), 게시예정 하나
      const nine = await insert('09:00', '10:00');
      const ten = await insert('10:00', '11:00', {
        holdCustomerId: customer.customerId,
        holdExpiresAt: kst('2026-10-31T12:05:00'),
      });
      const eleven = await insert('11:00', '12:00', {
        status: 'scheduled',
        publishAt: kst('2026-10-31T18:00:00'),
      });
      const twelve = await insert('12:00', '13:00');
      const thirteen = await insert('13:00', '14:00');
      await insert('14:00', '15:00');
      // 빼는 것: 예약됨, 원장님 마감, 시작한 매물(10/31 11시 시작), 시간대 안 칸(예약됨·손님이 결제 중), 다른 샵
      await insert('15:00', '16:00', { status: 'reserved' });
      await insert('16:00', '17:00', { status: 'closed', closeReason: 'mistake' });
      await insert('17:00', '18:00', {
        startAt: kst('2026-10-31T11:00:00'),
        endAt: kst('2026-10-31T12:00:00'),
      });
      const windowId = await addWindow(tx, shop, '2026-11-02');
      await tx.insert(slots).values([
        {
          ...testSlot(shop, '13:00', '14:00', { windowId, status: 'reserved' }),
          startAt: kst('2026-11-02T13:00:00'),
          endAt: kst('2026-11-02T14:00:00'),
        },
        // 시간대 안에서 손님이 결제 중인 칸은 게시중이지만 원장님이 올린 한 시술 매물이 아니다
        {
          ...testSlot(shop, '14:00', '15:00', {
            windowId,
            holdCustomerId: customer.customerId,
            holdExpiresAt: kst('2026-10-31T12:05:00'),
          }),
          startAt: kst('2026-11-02T14:00:00'),
          endAt: kst('2026-11-02T15:00:00'),
        },
      ]);
      await tx.insert(slots).values(testSlot(other, '09:00', '10:00'));

      const control = await selectShopSlotControl(tx, shop.shopId, NOW);
      expect(control?.openSlotCount).toBe(6);
      expect(control?.openSlots.map((row) => row.slotId)).toEqual([
        nine,
        ten,
        eleven,
        twelve,
        thirteen,
      ]);
      expect(control?.openSlots[1]).toEqual({
        slotId: ten,
        menuName: '커트',
        startAt: kst('2026-11-01T10:00:00'),
        publishAt: expect.any(Date),
        status: 'published',
        holdCustomerId: customer.customerId,
        holdExpiresAt: kst('2026-10-31T12:05:00'),
        windowId: null,
      });
    });
  });

  it('없는 샵이면 null, 매물이 없으면 빈 목록과 0', async () => {
    await withRollback(async (tx) => {
      expect(await selectShopSlotControl(tx, crypto.randomUUID(), NOW)).toBeNull();
      const shop = await createTestShop(tx, { status: 'approved' });
      expect(await selectShopSlotControl(tx, shop.shopId, NOW)).toEqual({
        pause: null,
        openWindows: [],
        openWindowCount: 0,
        openSlots: [],
        openSlotCount: 0,
      });
    });
  });
});
