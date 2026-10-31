// 업종 변경 때 판매 전 매물만 마감하고 메뉴를 숨기는지, 결제 중인 매물이 있으면 막는지 실제 DB로 본다(O2).
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { menus, slots } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  testSlot,
} from '../../../../../tests/db/fixtures';
import {
  closeTestDb,
  describeDb,
  type TestTx,
  withRollback,
} from '../../../../../tests/db/test-db';
import { closeSlotsAndHideMenus, selectCategoryChangeImpact } from './category-change-store';

afterAll(closeTestDb);

// 매물 날짜(2026-11-01) 전날
const now = new Date('2026-10-31T12:00:00+09:00');

const slotRows = (tx: TestTx, shopId: string) =>
  tx
    .select({
      start: slots.startAt,
      status: slots.status,
      closeReason: slots.closeReason,
      closedAt: slots.closedAt,
    })
    .from(slots)
    .where(eq(slots.shopId, shopId))
    .orderBy(slots.startAt);

describeDb('업종 변경 (실제 DB)', () => {
  it('판매 전 매물만 마감(기타)하고 메뉴를 모두 숨긴다. 예약·지난 매물은 그대로다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const other = await createTestShop(tx);
      const customer = await createTestCustomer(tx);
      await tx.insert(slots).values([
        testSlot(shop, '09:00', '10:00'),
        // 게시 시각 전(예약대기)
        testSlot(shop, '10:00', '11:00', {
          status: 'scheduled',
          publishAt: new Date('2026-11-01T00:00:00+09:00'),
        }),
        testSlot(shop, '11:00', '12:00', { status: 'closed', closeReason: 'mistake' }),
        testSlot(other, '09:00', '10:00'),
      ]);
      await createTestReservation(tx, shop, customer.customerId, '13:00', '14:00', 'confirmed');
      // 시작이 지나 이미 마감으로 계산되는 매물(저장 값은 게시중)
      await tx.insert(slots).values(
        testSlot(shop, '15:00', '16:00', {
          startAt: new Date('2026-10-30T15:00:00+09:00'),
          endAt: new Date('2026-10-30T16:00:00+09:00'),
        }),
      );

      expect(await selectCategoryChangeImpact(tx, shop.shopId, now)).toEqual({
        openSlots: 2,
        heldSlots: 0,
        visibleMenus: 1,
      });
      expect(await closeSlotsAndHideMenus(tx, shop.shopId, now)).toEqual({
        ok: true,
        closedSlots: 2,
        hiddenMenus: 1,
      });

      const rows = await slotRows(tx, shop.shopId);
      expect(rows.map((row) => [row.status, row.closeReason])).toEqual([
        ['published', null], // 지난 매물
        ['closed', 'other'],
        ['closed', 'other'],
        ['closed', 'mistake'], // 원래 마감 사유 그대로
        ['reserved', null],
      ]);
      expect(rows[1].closedAt).toEqual(now);

      const [menu] = await tx.select().from(menus).where(eq(menus.shopId, shop.shopId));
      expect(menu.hiddenAt).toEqual(now);

      // 다른 샵은 그대로
      const [otherSlot] = await slotRows(tx, other.shopId);
      expect(otherSlot.status).toBe('published');
      const [otherMenu] = await tx.select().from(menus).where(eq(menus.shopId, other.shopId));
      expect(otherMenu.hiddenAt).toBeNull();
    });
  });

  it('다른 고객이 결제 중인 매물이 있으면 아무것도 바꾸지 않는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const customer = await createTestCustomer(tx);
      await tx.insert(slots).values([
        testSlot(shop, '09:00', '10:00'),
        testSlot(shop, '10:00', '11:00', {
          holdCustomerId: customer.customerId,
          holdExpiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        }),
      ]);

      expect(await selectCategoryChangeImpact(tx, shop.shopId, now)).toMatchObject({
        openSlots: 2,
        heldSlots: 1,
      });
      // 부른 쪽(actions.ts)이 트랜잭션을 되돌린다. 여기서는 결제 중 매물이 마감되지 않았는지만 본다
      expect(await closeSlotsAndHideMenus(tx, shop.shopId, now)).toEqual({ ok: false });
      const rows = await slotRows(tx, shop.shopId);
      expect(rows[1].status).toBe('published');
      const [menu] = await tx.select().from(menus).where(eq(menus.shopId, shop.shopId));
      expect(menu.hiddenAt).toBeNull();
    });
  });

  it('홀딩이 만료됐으면 그 매물도 마감한다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const customer = await createTestCustomer(tx);
      await tx.insert(slots).values(
        testSlot(shop, '10:00', '11:00', {
          holdCustomerId: customer.customerId,
          holdExpiresAt: new Date(now.getTime() - 1),
        }),
      );
      expect(await closeSlotsAndHideMenus(tx, shop.shopId, now)).toMatchObject({
        ok: true,
        closedSlots: 1,
      });
    });
  });
});
