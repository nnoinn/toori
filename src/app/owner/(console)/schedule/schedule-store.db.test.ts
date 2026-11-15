// 예약 현황 캘린더 조회가 그 샵의 보는 기간 매물·시간대와 예약만 고르는지 실제 DB로 본다(S-402).
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
import { selectScheduleSlots, selectScheduleWindows } from './schedule-store';

afterAll(closeTestDb);

/** 'YYYY-MM-DD HH:MM'(한국 시간) */
const kst = (value: string) => new Date(`${value.replace(' ', 'T')}:00+09:00`);

// 하루 보기(2026-11-01, testSlot 날짜)
const from = kst('2026-11-01 00:00');
const to = kst('2026-11-02 00:00');

/** 시간대 한 줄과 그 샵 메뉴 서비스 하나(#308) */
async function addWindow(tx: TestTx, shop: TestShop, start: string, end: string) {
  const [row] = await tx
    .insert(slotWindows)
    .values({
      shopId: shop.shopId,
      startAt: kst(start),
      endAt: kst(end),
      publishAt: kst('2026-10-31 08:00'),
      status: 'published',
      createdBy: shop.createdBy,
    })
    .returning({ id: slotWindows.id });
  await tx.insert(slotWindowMenus).values({
    windowId: row.id,
    menuId: shop.menuId,
    serviceType: 'cut',
    menuName: '커트',
    listPrice: 20000,
    durationMinutes: 60,
    discountRate: 30,
    salePrice: 14000,
  });
  return row.id;
}

describeDb('원장님 예약 현황 조회 (실제 DB)', () => {
  it('보는 기간에 시작하는 그 샵 매물만 시작 순서로, 예약은 예약자 이름·예약 상태와 같이(지난 예약도)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const other = await createTestShop(tx);
      const customer = await createTestCustomer(tx);
      await tx.insert(slots).values([
        testSlot(shop, '15:00', '16:00'),
        testSlot(shop, '09:00', '10:00', { status: 'closed', closeReason: 'mistake' }),
        // 전날과, 보는 기간이 끝나는 시각(다음 날 0시)에 시작하는 매물: 빠진다
        testSlot(shop, '10:00', '11:00', {
          startAt: kst('2026-10-31 10:00'),
          endAt: kst('2026-10-31 11:00'),
        }),
        testSlot(shop, '10:00', '11:00', {
          startAt: kst('2026-11-02 00:00'),
          endAt: kst('2026-11-02 01:00'),
        }),
        // 다른 샵 매물: 빠진다
        testSlot(other, '12:00', '13:00'),
      ]);
      const { reservation } = await createTestReservation(
        tx,
        shop,
        customer.customerId,
        '11:00',
        '12:00',
        'completed',
        { visitResult: 'no_show', visitRecordedAt: kst('2026-11-01 12:30') },
      );

      // 저녁에 열면 시작이 지난 게시중 매물은 마감으로 보이고 고칠 수 없다
      const evening = await selectScheduleSlots(tx, shop.shopId, {
        from,
        to,
        now: kst('2026-11-01 20:00'),
      });
      expect(
        evening.map((slot) => [
          slot.startAt,
          slot.status,
          slot.editable,
          slot.reservation && [
            slot.reservation.id,
            slot.reservation.customerName,
            slot.reservation.view,
          ],
        ]),
      ).toEqual([
        [kst('2026-11-01 09:00').toISOString(), 'closed', false, null],
        [
          kst('2026-11-01 11:00').toISOString(),
          'completed',
          false,
          [reservation.id, '테스트 고객', 'noShow'],
        ],
        [kst('2026-11-01 15:00').toISOString(), 'closed', false, null],
      ]);

      // 아침에 열면 게시중 매물은 고칠 수 있다
      const morning = await selectScheduleSlots(tx, shop.shopId, {
        from,
        to,
        now: kst('2026-11-01 08:00'),
      });
      expect(morning.at(-1)).toMatchObject({ status: 'published', editable: true });
    });
  });

  it('시간대 안에서 손님이 결제 중인 칸은 빼고 결제가 끝난 칸은 보인다. 시간대는 보는 기간 것만(WINDOW-08)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const customer = await createTestCustomer(tx);
      const windowId = await addWindow(tx, shop, '2026-11-01 13:00', '2026-11-01 18:00');
      await addWindow(tx, shop, '2026-11-02 13:00', '2026-11-02 18:00');
      const hold = {
        holdCustomerId: customer.customerId,
        holdExpiresAt: kst('2026-11-01 09:10'),
      };
      await tx.insert(slots).values([
        // 원장님이 올린 매물: 손님이 결제 중이어도 보이고 "결제 중"이다
        testSlot(shop, '09:00', '10:00', hold),
        testSlot(shop, '13:00', '14:00', { windowId, ...hold }),
        testSlot(shop, '15:00', '16:00', { windowId, status: 'reserved' }),
      ]);
      const now = kst('2026-11-01 09:00');

      const rows = await selectScheduleSlots(tx, shop.shopId, { from, to, now });
      expect(rows.map((slot) => [slot.startAt, slot.status, slot.onHold, slot.editable])).toEqual([
        [kst('2026-11-01 09:00').toISOString(), 'published', true, false],
        [kst('2026-11-01 15:00').toISOString(), 'reserved', false, false],
      ]);

      const windows = await selectScheduleWindows(tx, shop.shopId, { from, to, now });
      expect(windows).toEqual([
        {
          kind: 'window',
          id: windowId,
          startAt: kst('2026-11-01 13:00').toISOString(),
          endAt: kst('2026-11-01 18:00').toISOString(),
          status: 'published',
          menuCount: 1,
        },
      ]);
    });
  });
});
