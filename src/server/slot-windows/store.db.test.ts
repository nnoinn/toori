// 시간대 매물 DB 읽기를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다 (#308 가짜 결과 버전).

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { menus, slots, slotWindows } from '@/db/schema';

import { createTestCustomer, createTestShop, testSlot } from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../tests/db/test-db';
import {
  readAreaShops,
  readOccupiedRanges,
  readShopBusyRanges,
  readWindowShop,
  readWindowShopProfile,
} from './store';

type Db = Parameters<typeof readWindowShop>[0];

/** 'HH:MM'(2026-11-01, 한국 시간, fixtures testSlot과 같은 날) */
const at = (hm: string) => new Date(`2026-11-01T${hm}:00+09:00`);
const DAY = { from: at('00:00'), to: at('23:30') };

describeDb('시간대 매물 DB 읽기 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('메뉴는 숨긴 것도 읽고 hidden으로 표시한다', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const shop = await createTestShop(tx, { status: 'approved' });
      await tx
        .update(menus)
        .set({ hiddenAt: at('09:00') })
        .where(eq(menus.id, shop.menuId));
      const read = await readWindowShop(db, shop.shopId);
      expect(read?.menus).toEqual([
        expect.objectContaining({ id: shop.menuId, serviceType: 'cut', hidden: true }),
      ]);
      expect(await readWindowShop(db, crypto.randomUUID())).toBeNull();
    });
  });

  it('이미 올린 시간: 예약대기·게시중·예약됨 매물과 예약대기·게시중 시간대(마감·취소는 뺀다)', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const shop = await createTestShop(tx, { status: 'approved' });
      await tx.insert(slots).values(testSlot(shop, '09:00', '10:00', { status: 'reserved' }));
      await tx.insert(slots).values(testSlot(shop, '10:00', '11:00', { status: 'cancelled' }));
      await tx.insert(slotWindows).values({
        shopId: shop.shopId,
        startAt: at('13:00'),
        endAt: at('18:00'),
        publishAt: at('08:00'),
        status: 'published',
        createdBy: shop.createdBy,
      });
      await tx.insert(slotWindows).values({
        shopId: shop.shopId,
        startAt: at('19:00'),
        endAt: at('20:00'),
        publishAt: at('08:00'),
        status: 'closed',
        createdBy: shop.createdBy,
      });
      const busy = await readShopBusyRanges(db, { shopId: shop.shopId, ...DAY });
      expect(busy.map((range) => range.start.toISOString()).sort()).toEqual(
        [at('09:00'), at('13:00')].map((date) => date.toISOString()).sort(),
      );
    });
  });

  it('고객 시작 시각의 차 있는 시간: 결제 없이 홀딩이 끝난 시간대 안 매물은 비어 있는 것으로 본다', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const [window] = await tx
        .insert(slotWindows)
        .values({
          shopId: shop.shopId,
          startAt: at('13:00'),
          endAt: at('18:00'),
          publishAt: at('08:00'),
          status: 'published',
          createdBy: shop.createdBy,
        })
        .returning({ id: slotWindows.id });
      const now = at('12:00');
      // 결제 중(홀딩 남음), 홀딩 끝남, 예약됨
      await tx.insert(slots).values([
        testSlot(shop, '13:00', '14:00', {
          windowId: window.id,
          holdCustomerId: customerId,
          holdExpiresAt: at('12:05'),
        }),
        testSlot(shop, '14:00', '15:00', {
          windowId: window.id,
          holdCustomerId: customerId,
          holdExpiresAt: at('11:55'),
        }),
        testSlot(shop, '15:00', '16:00', { windowId: window.id, status: 'reserved' }),
      ]);
      const occupied = await readOccupiedRanges(db, { shopId: shop.shopId, ...DAY, now });
      expect(occupied.map((range) => range.start.toISOString()).sort()).toEqual(
        [at('13:00'), at('15:00')].map((date) => date.toISOString()).sort(),
      );
    });
  });

  it('범위 안 승인된 샵만(업종 필터), 상세 샵은 승인된 샵만', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const approved = await createTestShop(tx, { status: 'approved', name: '가 테스트 미용실' });
      const pending = await createTestShop(tx, { status: 'pending' });
      const area = { sigunguCode: '41273' };
      const shops = await readAreaShops(db, { area, category: null, limit: 1000 });
      const ids = shops.map((shop) => shop.shopId);
      expect(ids).toContain(approved.shopId);
      expect(ids).not.toContain(pending.shopId);
      expect(shops.find((shop) => shop.shopId === approved.shopId)).toMatchObject({
        name: '가 테스트 미용실',
        category: 'hair',
        lat: expect.any(Number),
        lng: expect.any(Number),
        imagePath: null,
      });
      const nails = await readAreaShops(db, { area, category: 'nail_lash', limit: 1000 });
      expect(nails.map((shop) => shop.shopId)).not.toContain(approved.shopId);

      expect(await readWindowShopProfile(db, approved.shopId)).toMatchObject({
        shop: { shopId: approved.shopId, name: '가 테스트 미용실' },
        imagePaths: [],
        category: 'hair',
      });
      expect(await readWindowShopProfile(db, pending.shopId)).toBeNull();
    });
  });
});
