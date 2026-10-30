// 업종 변경이 판매 전·예약된 매물이 있으면 막히고, 없으면 메뉴를 초기화하는지 실제 DB로 본다(O2, 10/29 결정).
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
import { closeTestDb, describeDb, withRollback } from '../../../../../tests/db/test-db';
import { resetMenusForCategoryChange, selectCategoryChangeImpact } from './category-change-store';

afterAll(closeTestDb);

// 매물 날짜(2026-11-01) 전날
const now = new Date('2026-10-31T12:00:00+09:00');

describeDb('업종 변경 (실제 DB)', () => {
  it('예약대기·게시중·시작 전 예약됨 매물만 막는 매물로 센다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const customer = await createTestCustomer(tx);
      await tx.insert(slots).values([
        testSlot(shop, '09:00', '10:00'),
        // 게시 시각 전(예약대기)
        testSlot(shop, '10:00', '11:00', {
          status: 'scheduled',
          publishAt: new Date('2026-11-01T00:00:00+09:00'),
        }),
        // 막지 않는 매물: 마감, 취소, 완료
        testSlot(shop, '11:00', '12:00', { status: 'closed', closeReason: 'mistake' }),
        testSlot(shop, '12:00', '13:00', { status: 'cancelled' }),
        testSlot(shop, '16:00', '17:00', { status: 'completed' }),
      ]);
      // 시작 전 예약됨: 막는다
      await createTestReservation(tx, shop, customer.customerId, '13:00', '14:00', 'confirmed');
      // 시작이 지나 이미 마감으로 계산되는 매물(저장 값은 게시중): 막지 않는다
      await tx.insert(slots).values(
        testSlot(shop, '15:00', '16:00', {
          startAt: new Date('2026-10-30T15:00:00+09:00'),
          endAt: new Date('2026-10-30T16:00:00+09:00'),
        }),
      );

      expect(await selectCategoryChangeImpact(tx, shop.shopId, 'hair', now)).toEqual({
        activeSlots: 3,
        menus: 1,
      });
    });
  });

  it('시작이 지난 예약됨 매물(방문 확인 중)은 막지 않는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const customer = await createTestCustomer(tx);
      await createTestReservation(tx, shop, customer.customerId, '13:00', '14:00', 'confirmed');
      const afterStart = new Date('2026-11-01T13:30:00+09:00');
      expect(await selectCategoryChangeImpact(tx, shop.shopId, 'hair', afterStart)).toMatchObject({
        activeSlots: 0,
      });
    });
  });

  it('메뉴 수는 지금 업종 메뉴만 센다(숨긴 메뉴 포함, 예전 업종 메뉴 제외)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      await tx.insert(menus).values([
        // 숨긴 지금 업종 메뉴: 센다
        {
          shopId: shop.shopId,
          serviceType: 'perm',
          name: '펌',
          listPrice: 60000,
          durationMinutes: 120,
          sortOrder: 1,
          hiddenAt: now,
        },
        // 예전에 초기화된 다른 업종 메뉴: 세지 않는다
        {
          shopId: shop.shopId,
          serviceType: 'gel_nail',
          name: '젤네일',
          listPrice: 40000,
          durationMinutes: 60,
          sortOrder: 2,
          hiddenAt: now,
        },
      ]);
      expect(await selectCategoryChangeImpact(tx, shop.shopId, 'hair', now)).toEqual({
        activeSlots: 0,
        menus: 2,
      });
    });
  });

  it('막는 매물이 없으면 메뉴를 모두 숨기고(초기화) 매물·다른 샵은 그대로 둔다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const other = await createTestShop(tx);
      await tx
        .insert(slots)
        .values([
          testSlot(shop, '11:00', '12:00', { status: 'closed', closeReason: 'mistake' }),
          testSlot(other, '09:00', '10:00'),
        ]);

      expect(await resetMenusForCategoryChange(tx, shop.shopId, 'hair', now)).toEqual({
        ok: true,
        resetMenus: 1,
      });
      const [menu] = await tx.select().from(menus).where(eq(menus.shopId, shop.shopId));
      expect(menu.hiddenAt).toEqual(now);
      const [slot] = await tx.select().from(slots).where(eq(slots.shopId, shop.shopId));
      expect([slot.status, slot.closeReason]).toEqual(['closed', 'mistake']);

      const [otherMenu] = await tx.select().from(menus).where(eq(menus.shopId, other.shopId));
      expect(otherMenu.hiddenAt).toBeNull();
      const [otherSlot] = await tx.select().from(slots).where(eq(slots.shopId, other.shopId));
      expect(otherSlot.status).toBe('published');
    });
  });

  it('막는 매물이 있으면(고객이 결제 중인 매물 포함) 아무것도 바꾸지 않는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const customer = await createTestCustomer(tx);
      await tx.insert(slots).values(
        testSlot(shop, '10:00', '11:00', {
          holdCustomerId: customer.customerId,
          holdExpiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        }),
      );

      expect(await resetMenusForCategoryChange(tx, shop.shopId, 'hair', now)).toEqual({
        ok: false,
      });
      const [slot] = await tx.select().from(slots).where(eq(slots.shopId, shop.shopId));
      expect(slot.status).toBe('published');
      const [menu] = await tx.select().from(menus).where(eq(menus.shopId, shop.shopId));
      expect(menu.hiddenAt).toBeNull();
    });
  });
});
