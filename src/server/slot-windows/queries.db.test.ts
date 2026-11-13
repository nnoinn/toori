// 시간대 매물 고객 목록·상세(listSlotWindows, getSlotWindow)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 끝까지 확인한다 (#308 ②).
// 원장님이 올린 시간대·서비스(insertSlotWindows)와 그 안의 예약·결제 중 매물을 넣고, 카드·상세의 시작 가능 시각을 본다.
// 보이는 시간대 고르기(게시·마감·승인·신규 고객 전용)는 store.db.test.ts, 카드 요약 계산은 view.test.ts가 자세히 본다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { EMPTY_FILTERS } from '@/features/map/filters';
import { menus, slots } from '@/db/schema';

import { createTestCustomer, createTestShop, testSlot } from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../tests/db/test-db';
import { getSlotWindow, listSlotWindows } from './queries';
import { insertSlotWindows } from './store';

type Db = Parameters<typeof listSlotWindows>[0];

/** 'HH:MM'(2026-11-01, 한국 시간, fixtures testSlot과 같은 날) */
const at = (hm: string) => new Date(`2026-11-01T${hm}:00+09:00`);
const iso = (hm: string) => at(hm).toISOString();
const NOW = at('12:00');

describeDb('시간대 매물 고객 목록·상세 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('예약됨·결제 중 매물을 뺀 시작 가능 시각으로 카드와 상세를 만들고, 꽉 차면 목록·상세에서 내린다', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const shop = await createTestShop(tx, { status: 'approved', name: '시간대 테스트 미용실' });
      const { customerId } = await createTestCustomer(tx);
      const [perm] = await tx
        .insert(menus)
        .values({
          shopId: shop.shopId,
          serviceType: 'perm',
          name: '펌',
          listPrice: 80_000,
          durationMinutes: 120,
          sortOrder: 1,
        })
        .returning();
      // 판매가 = 정가 × (1 − 할인율)(CLAUDE.md, S-203): 20,000원 30% → 14,000원, 80,000원 20% → 64,000원
      const [window] = await insertSlotWindows(tx, {
        shopId: shop.shopId,
        createdBy: shop.createdBy,
        newCustomerOnly: false,
        windows: [
          { start: at('13:00'), end: at('18:00'), publishAt: at('08:00'), status: 'published' },
        ],
        menus: [
          {
            menuId: shop.menuId,
            serviceType: 'cut',
            menuName: '커트',
            menuDescription: null,
            listPrice: 20_000,
            durationMinutes: 60,
            discountRate: 30,
            salePrice: 14_000,
          },
          {
            menuId: perm.id,
            serviceType: 'perm',
            menuName: '펌',
            menuDescription: null,
            listPrice: 80_000,
            durationMinutes: 120,
            discountRate: 20,
            salePrice: 64_000,
          },
        ],
      });
      // 13:00~15:00 예약됨, 15:00~16:00 결제 중(홀딩 남음), 16:00~17:00 결제 없이 홀딩이 끝남(비어 있음)
      const [, , released] = await tx
        .insert(slots)
        .values([
          testSlot(shop, '13:00', '15:00', { windowId: window.id, status: 'reserved' }),
          testSlot(shop, '15:00', '16:00', {
            windowId: window.id,
            holdCustomerId: customerId,
            holdExpiresAt: at('12:05'),
          }),
          testSlot(shop, '16:00', '17:00', {
            windowId: window.id,
            holdCustomerId: customerId,
            holdExpiresAt: at('11:55'),
          }),
        ])
        .returning({ id: slots.id });
      const query = { sigunguCode: '41273', filters: EMPTY_FILTERS, customerId: null, now: NOW };

      const card = (await listSlotWindows(db, query)).find((row) => row.windowId === window.id);
      expect(card).toEqual({
        windowId: window.id,
        shopId: shop.shopId,
        shopName: '시간대 테스트 미용실',
        category: 'hair',
        lat: expect.any(Number),
        lng: expect.any(Number),
        imageUrl: null,
        startAt: iso('13:00'),
        endAt: iso('18:00'),
        menuCount: 2,
        firstMenuName: '커트',
        maxDiscountRate: 30,
        minSalePrice: 14_000,
        newCustomerOnly: false,
        earliestStartAt: iso('16:00'),
      });
      expect(
        (
          await listSlotWindows(db, {
            ...query,
            filters: { ...EMPTY_FILTERS, services: ['color'] },
          })
        ).map((row) => row.windowId),
      ).not.toContain(window.id);

      const detail = await getSlotWindow(db, { windowId: window.id, customerId: null, now: NOW });
      expect(detail).toMatchObject({
        windowId: window.id,
        shop: { shopId: shop.shopId, name: '시간대 테스트 미용실' },
        imageUrls: [],
        startAt: iso('13:00'),
        endAt: iso('18:00'),
        newCustomerOnly: false,
        serverNow: NOW.toISOString(),
      });
      expect(
        detail!.menus.map((menu) => [menu.name, menu.salePrice, menu.starts.map((s) => s.startAt)]),
      ).toEqual([
        ['커트', 14_000, [iso('16:00'), iso('16:30'), iso('17:00')]],
        // 펌 2시간은 16:00에 시작해야 18:00 안에 끝난다
        ['펌', 64_000, [iso('16:00')]],
      ]);
      expect(detail!.menus[0].starts[0]).toEqual({ startAt: iso('16:00'), endAt: iso('17:00') });

      // 남은 16:00~18:00도 예약되면 들어가는 서비스가 없다(꽉 참). 홀딩이 끝난 칸은 먼저 마감한다(③에서 하는 일)
      await tx
        .update(slots)
        .set({ status: 'closed', closeReason: 'hold_released', closedAt: NOW })
        .where(eq(slots.id, released.id));
      await tx
        .insert(slots)
        .values(testSlot(shop, '16:00', '18:00', { windowId: window.id, status: 'reserved' }));
      expect((await listSlotWindows(db, query)).map((row) => row.windowId)).not.toContain(
        window.id,
      );
      expect(
        await getSlotWindow(db, { windowId: window.id, customerId: null, now: NOW }),
      ).toBeNull();
    });
  });

  it('id 모양이 아니거나 없는 시간대는 상세가 null', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      for (const windowId of ['not-a-uuid', crypto.randomUUID()]) {
        expect(await getSlotWindow(db, { windowId, customerId: null, now: NOW })).toBeNull();
      }
    });
  });
});
