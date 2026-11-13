// 시간대 매물 DB 읽기를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다 (#308). 고객 목록·상세 읽기는 진짜 버전 ②.

import { and, eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { menus, orders, slots, slotWindows } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  type TestShop,
  testSlot,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import {
  insertSlotWindows,
  readAreaWindows,
  readOccupiedRanges,
  readOccupiedRangesByShop,
  readOpenWindow,
  readShopBusyRanges,
  readWindowMenus,
  readWindowShop,
  readWindowShopProfile,
} from './store';

type Db = Parameters<typeof readWindowShop>[0];

/** 'HH:MM'(2026-11-01, 한국 시간, fixtures testSlot과 같은 날) */
const at = (hm: string) => new Date(`2026-11-01T${hm}:00+09:00`);
const DAY = { from: at('00:00'), to: at('23:30') };
const NOW = at('12:00');
const AREA = { sigunguCode: '41273' };

/** 시간대 한 줄을 바로 넣는다(저장 상태·게시 시각·신규 고객 전용을 바꿔 가며 본다) */
async function addWindow(
  tx: TestTx,
  shop: TestShop,
  start: string,
  end: string,
  extra: Partial<typeof slotWindows.$inferInsert> = {},
) {
  const [row] = await tx
    .insert(slotWindows)
    .values({
      shopId: shop.shopId,
      startAt: at(start),
      endAt: at(end),
      publishAt: at('08:00'),
      status: 'published',
      createdBy: shop.createdBy,
      ...extra,
    })
    .returning({ id: slotWindows.id });
  return row.id;
}

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

  it('고객 시작 시각의 차 있는 시간: 결제 없이 홀딩이 끝난 시간대 안 매물은 비어 있는 것으로 보고, 결제 대기 주문이 있으면 막는다', async () => {
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

      // 홀딩이 끝났어도 결제 대기 주문이 있으면(결제는 했는데 확인이 늦을 수 있다) 그 시간을 막는다(#308 ③)
      const [expired] = await tx
        .select({ id: slots.id })
        .from(slots)
        .where(and(eq(slots.windowId, window.id), eq(slots.startAt, at('14:00'))));
      await tx.insert(orders).values({
        paymentId: `test_${crypto.randomUUID()}`,
        slotId: expired.id,
        customerId,
        salePrice: 14_000,
        amount: 14_000,
        refundPolicyVersion: 'test',
        refundPolicyAgreedAt: now,
        status: 'pending',
      });
      const withPending = await readOccupiedRanges(db, { shopId: shop.shopId, ...DAY, now });
      expect(withPending.map((range) => range.start.toISOString()).sort()).toEqual(
        [at('13:00'), at('14:00'), at('15:00')].map((date) => date.toISOString()).sort(),
      );
    });
  });

  it('고객에게 보이는 시간대: 게시 시각이 지났고 끝나지 않은 예약대기·게시중 시간대만, 승인된 샵·범위·업종', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const approved = await createTestShop(tx, { status: 'approved', name: '가 테스트 미용실' });
      const pending = await createTestShop(tx, { status: 'pending' });
      const published = await addWindow(tx, approved, '13:00', '15:00');
      // 예약대기로 저장했어도 게시 시각이 지났으면 보인다
      const publishedLate = await addWindow(tx, approved, '15:00', '16:00', {
        status: 'scheduled',
      });
      const notYet = await addWindow(tx, approved, '16:00', '17:00', {
        status: 'scheduled',
        publishAt: at('12:30'),
      });
      const closed = await addWindow(tx, approved, '17:00', '18:00', {
        status: 'closed',
        closeReason: 'mistake',
        closedAt: at('11:00'),
      });
      const ended = await addWindow(tx, approved, '10:00', '12:00');
      const pendingShop = await addWindow(tx, pending, '13:00', '15:00');

      const read = (category: 'hair' | 'nail_lash' | null) =>
        readAreaWindows(db, { area: AREA, category, customerId: null, now: NOW, limit: 1000 });
      const mine = (await read(null)).filter((row) =>
        [approved.shopId, pending.shopId].includes(row.shopId),
      );
      expect(mine.map((row) => row.windowId)).toEqual([published, publishedLate]);
      expect(mine[0]).toEqual({
        windowId: published,
        shopId: approved.shopId,
        startAt: at('13:00'),
        endAt: at('15:00'),
        newCustomerOnly: false,
        name: '가 테스트 미용실',
        category: 'hair',
        lat: expect.any(Number),
        lng: expect.any(Number),
        imagePath: null,
      });
      expect((await read('nail_lash')).map((row) => row.shopId)).not.toContain(approved.shopId);
      expect(
        await readAreaWindows(db, {
          area: { sigunguCode: '11110' },
          category: null,
          customerId: null,
          now: NOW,
          limit: 1000,
        }),
      ).not.toContainEqual(expect.objectContaining({ shopId: approved.shopId }));

      const open = (windowId: string) =>
        readOpenWindow(db, { windowId, customerId: null, now: NOW });
      expect(await open(published)).toEqual({
        windowId: published,
        shopId: approved.shopId,
        startAt: at('13:00'),
        endAt: at('15:00'),
        newCustomerOnly: false,
      });
      expect(await open(publishedLate)).not.toBeNull();
      for (const hidden of [notYet, closed, ended, pendingShop]) {
        expect(await open(hidden)).toBeNull();
      }

      expect(await readWindowShopProfile(db, approved.shopId)).toMatchObject({
        shop: { shopId: approved.shopId, name: '가 테스트 미용실' },
        imagePaths: [],
        category: 'hair',
      });
      expect(await readWindowShopProfile(db, pending.shopId)).toBeNull();
    });
  });

  it('신규 고객 전용 시간대는 그 샵에 확정·이용 완료 예약이 있는 고객에게 보이지 않는다(취소 이력·로그인 안 함은 보인다)', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const shop = await createTestShop(tx, { status: 'approved' });
      const visited = await createTestCustomer(tx);
      const cancelledOnly = await createTestCustomer(tx);
      const fresh = await createTestCustomer(tx);
      await createTestReservation(tx, shop, visited.customerId, '09:00', '10:00', 'completed');
      await createTestReservation(
        tx,
        shop,
        cancelledOnly.customerId,
        '10:00',
        '11:00',
        'cancelled',
      );
      const onlyNew = await addWindow(tx, shop, '13:00', '15:00', { newCustomerOnly: true });
      const everyone = await addWindow(tx, shop, '15:00', '17:00');

      const listFor = async (customerId: string | null) =>
        (
          await readAreaWindows(db, {
            area: AREA,
            category: null,
            customerId,
            now: NOW,
            limit: 1000,
          })
        )
          .filter((row) => row.shopId === shop.shopId)
          .map((row) => row.windowId);
      expect(await listFor(visited.customerId)).toEqual([everyone]);
      for (const customerId of [cancelledOnly.customerId, fresh.customerId, null]) {
        expect(await listFor(customerId)).toEqual([onlyNew, everyone]);
      }

      expect(
        await readOpenWindow(db, { windowId: onlyNew, customerId: visited.customerId, now: NOW }),
      ).toBeNull();
      expect(
        await readOpenWindow(db, { windowId: onlyNew, customerId: fresh.customerId, now: NOW }),
      ).toMatchObject({ windowId: onlyNew, newCustomerOnly: true });
    });
  });

  it('올린 서비스는 올릴 때 값을 샵 메뉴 순서대로 읽는다(나중에 메뉴를 고쳐도 그대로)', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const shop = await createTestShop(tx, { status: 'approved' });
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
      const item = (menuId: string, name: string, serviceType: 'cut' | 'perm') =>
        serviceType === 'cut'
          ? {
              menuId,
              serviceType,
              menuName: name,
              menuDescription: null,
              listPrice: 20_000,
              durationMinutes: 60,
              discountRate: 30,
              salePrice: 14_000,
            }
          : {
              menuId,
              serviceType,
              menuName: name,
              menuDescription: '디지털 펌',
              listPrice: 80_000,
              durationMinutes: 120,
              discountRate: 20,
              salePrice: 64_000,
            };
      const [first, second] = await insertSlotWindows(tx, {
        shopId: shop.shopId,
        createdBy: shop.createdBy,
        newCustomerOnly: false,
        windows: [
          { start: at('13:00'), end: at('15:00'), publishAt: at('08:00'), status: 'published' },
          { start: at('16:00'), end: at('18:00'), publishAt: at('08:00'), status: 'published' },
        ],
        // 넣는 순서와 상관없이 메뉴 순서(커트 0, 펌 1)로 읽는다
        menus: [item(perm.id, '펌', 'perm'), item(shop.menuId, '커트', 'cut')],
      });
      await tx
        .update(menus)
        .set({ name: '커트(바꿈)', listPrice: 30_000 })
        .where(eq(menus.id, shop.menuId));

      const read = await readWindowMenus(db, [first.id, second.id]);
      const expected = [
        {
          menuId: shop.menuId,
          serviceType: 'cut',
          name: '커트',
          description: null,
          durationMinutes: 60,
          listPrice: 20_000,
          discountRate: 30,
          salePrice: 14_000,
        },
        {
          menuId: perm.id,
          serviceType: 'perm',
          name: '펌',
          description: '디지털 펌',
          durationMinutes: 120,
          listPrice: 80_000,
          discountRate: 20,
          salePrice: 64_000,
        },
      ];
      expect(read.get(first.id)).toEqual(expected);
      expect(read.get(second.id)).toEqual(expected);
      expect(await readWindowMenus(db, [])).toEqual(new Map());
    });
  });

  it('차 있는 시간을 여러 샵에서 한 번에 읽으면 샵별로 나눠 준다', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const a = await createTestShop(tx, { status: 'approved' });
      const b = await createTestShop(tx, { status: 'approved' });
      const empty = await createTestShop(tx, { status: 'approved' });
      await tx
        .insert(slots)
        .values([
          testSlot(a, '09:00', '10:00', { status: 'reserved' }),
          testSlot(a, '11:00', '12:00', { status: 'published' }),
          testSlot(b, '13:00', '14:00', { status: 'reserved' }),
          testSlot(b, '15:00', '16:00', { status: 'cancelled' }),
        ]);
      const read = await readOccupiedRangesByShop(db, {
        shopIds: [a.shopId, b.shopId, empty.shopId],
        ...DAY,
        now: NOW,
      });
      const starts = (shopId: string) =>
        (read.get(shopId) ?? []).map((range) => range.start.toISOString()).sort();
      expect(starts(a.shopId)).toEqual([at('09:00'), at('11:00')].map((d) => d.toISOString()));
      expect(starts(b.shopId)).toEqual([at('13:00').toISOString()]);
      expect(read.has(empty.shopId)).toBe(false);
      expect(await readOccupiedRangesByShop(db, { shopIds: [], ...DAY, now: NOW })).toEqual(
        new Map(),
      );
    });
  });
});
