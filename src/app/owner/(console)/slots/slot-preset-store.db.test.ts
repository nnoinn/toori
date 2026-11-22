// 매물 등록 "지난 매물로 빠르게 올리기"(S-207) 조회가 그 샵이 올린 한 시술 매물을 구성(메뉴·할인율·신규 고객 전용)끼리 묶어
// 가장 최근에 올린 구성부터 주는지 실제 DB로 본다. 상태와 상관없이 보고, 손님이 시간대 안에서 만든 칸과 다른 샵은 뺀다.
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { afterAll, expect, it } from 'vitest';

import { slots, slotWindows } from '@/db/schema';

import { createTestShop, testSlot } from '../../../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../../../tests/db/test-db';
import { selectSlotPresetRows } from './slot-preset-store';

afterAll(closeTestDb);

/** 'YYYY-MM-DD HH:MM'(한국 시간) */
const kst = (value: string) => new Date(`${value.replace(' ', 'T')}:00+09:00`);

describeDb('지난 매물 구성 (S-207)', () => {
  it('같은 구성은 하나로 묶고 가장 최근에 올린 구성부터, 시간대 칸·다른 샵은 뺀다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const other = await createTestShop(tx, { status: 'approved' });
      const [window] = await tx
        .insert(slotWindows)
        .values({
          shopId: shop.shopId,
          startAt: kst('2026-11-01 15:00'),
          endAt: kst('2026-11-01 18:00'),
          publishAt: kst('2026-10-31 08:00'),
          status: 'published',
          createdBy: shop.createdBy,
        })
        .returning({ id: slotWindows.id });

      await tx.insert(slots).values([
        // 30%·일반: 11/1에 올렸고 11/5에 또 올림(취소된 매물) → 가장 최근 구성
        testSlot(shop, '09:00', '10:00', { createdAt: kst('2026-11-01 09:00') }),
        testSlot(shop, '12:00', '13:00', {
          status: 'cancelled',
          createdAt: kst('2026-11-05 09:00'),
        }),
        // 50%·일반: 마감한 매물도 본다
        testSlot(shop, '10:30', '11:30', {
          discountRate: 50,
          salePrice: 10000,
          status: 'closed',
          createdAt: kst('2026-11-02 09:00'),
        }),
        // 30%·신규 고객 전용
        testSlot(shop, '13:30', '14:30', {
          newCustomerOnly: true,
          createdAt: kst('2026-11-03 09:00'),
        }),
        // 빼야 하는 것: 손님이 시간대 안에서 만든 칸(가장 최근이어도), 다른 샵
        testSlot(shop, '15:00', '16:00', {
          windowId: window.id,
          discountRate: 40,
          salePrice: 12000,
          status: 'reserved',
          createdAt: kst('2026-11-06 09:00'),
        }),
        testSlot(other, '09:00', '10:00', {
          discountRate: 20,
          salePrice: 16000,
          createdAt: kst('2026-11-07 09:00'),
        }),
      ]);

      expect(await selectSlotPresetRows(tx, shop.shopId)).toEqual([
        { menuId: shop.menuId, discountRate: 30, newCustomerOnly: false },
        { menuId: shop.menuId, discountRate: 30, newCustomerOnly: true },
        { menuId: shop.menuId, discountRate: 50, newCustomerOnly: false },
      ]);
    });
  });

  it('올린 매물이 없으면 빈 목록', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      expect(await selectSlotPresetRows(tx, shop.shopId)).toEqual([]);
    });
  });
});
