// 시간대 매물 원장님 저장·지난 설정·마감(insertSlotWindows, readLastWindowSettings, closeWindow)을
// 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다 (#308 진짜 버전 ①). 입력 확인은 rules.test.ts, 함수 흐름은 windows.test.ts가 본다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { menus, orders, slots, slotWindowMenus, slotWindows } from '@/db/schema';

import {
  createTestCustomer,
  createTestShop,
  type TestShop,
  testSlot,
} from '../../../tests/db/fixtures';
import {
  closeTestDb,
  describeDb,
  type TestTx,
  violatedConstraint,
  withRollback,
} from '../../../tests/db/test-db';
import type { WindowDraft, WindowMenuDraft } from './rules';
import {
  closeStaleWindowHolds,
  closeWindow,
  insertSlotWindows,
  readLastWindowSettings,
  readReleasedKeptSlots,
} from './store';

/** 'HH:MM'(2026-11-01, 한국 시간, fixtures testSlot과 같은 날) */
const at = (hm: string) => new Date(`2026-11-01T${hm}:00+09:00`);

const window = (start: string, end: string): WindowDraft => ({
  start: at(start),
  end: at(end),
  publishAt: at('08:00'),
  status: 'published',
});

/** 샵의 커트 메뉴(createTestShop이 만든 것)를 30%로 올리는 서비스 */
const cutMenu = (shop: TestShop): WindowMenuDraft => ({
  menuId: shop.menuId,
  serviceType: 'cut',
  menuName: '커트',
  menuDescription: null,
  listPrice: 20_000,
  durationMinutes: 60,
  discountRate: 30,
  salePrice: 14_000,
});

/** 샵에 메뉴 하나 더(정렬 순서 sortOrder) */
async function addMenu(tx: TestTx, shop: TestShop, name: string, sortOrder: number) {
  const [menu] = await tx
    .insert(menus)
    .values({
      shopId: shop.shopId,
      serviceType: 'perm',
      name,
      listPrice: 80_000,
      durationMinutes: 120,
      sortOrder,
    })
    .returning();
  return menu;
}

describeDb('시간대 매물 원장님 저장·지난 설정·마감 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('묶음마다 시간대 한 줄과 올릴 때 서비스 값을 저장하고 시작 순으로 돌려준다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const perm = await addMenu(tx, shop, '펌', 1);
      const permMenu: WindowMenuDraft = {
        menuId: perm.id,
        serviceType: 'perm',
        menuName: '펌',
        menuDescription: null,
        listPrice: 80_000,
        durationMinutes: 120,
        discountRate: 20,
        salePrice: 64_000,
      };

      const saved = await insertSlotWindows(tx, {
        shopId: shop.shopId,
        createdBy: shop.createdBy,
        newCustomerOnly: true,
        windows: [window('13:00', '18:00'), window('09:00', '12:00')],
        menus: [cutMenu(shop), permMenu],
      });

      expect(saved.map((row) => [row.startAt, row.endAt, row.status])).toEqual([
        [at('09:00'), at('12:00'), 'published'],
        [at('13:00'), at('18:00'), 'published'],
      ]);
      const rows = await tx.select().from(slotWindows).where(eq(slotWindows.shopId, shop.shopId));
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.newCustomerOnly && row.createdBy === shop.createdBy)).toBe(
        true,
      );
      for (const row of saved) {
        const items = await tx
          .select()
          .from(slotWindowMenus)
          .where(eq(slotWindowMenus.windowId, row.id));
        expect(
          items
            .map((item) => [item.menuId, item.menuName, item.discountRate, item.salePrice])
            .sort(),
        ).toEqual(
          [
            [shop.menuId, '커트', 30, 14_000],
            [perm.id, '펌', 20, 64_000],
          ].sort(),
        );
      }
    });
  });

  it('같은 샵의 예약대기·게시중·예약됨 매물이나 시간대와 겹치면 slot_windows_no_overlap으로 막는다(마감한 시간대는 괜찮다)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const other = await createTestShop(tx, { status: 'approved' });
      await tx.insert(slots).values(testSlot(shop, '10:00', '11:00', { status: 'reserved' }));
      const input = (windows: WindowDraft[], target = shop) => ({
        shopId: target.shopId,
        createdBy: target.createdBy,
        newCustomerOnly: false,
        windows,
        menus: [cutMenu(target)],
      });

      expect(
        await violatedConstraint(tx, (t) =>
          insertSlotWindows(t, input([window('09:00', '12:00')])),
        ),
      ).toBe('slot_windows_no_overlap');

      await insertSlotWindows(tx, input([window('13:00', '18:00')]));
      expect(
        await violatedConstraint(tx, (t) =>
          insertSlotWindows(t, input([window('17:00', '19:00')])),
        ),
      ).toBe('slot_windows_no_overlap');

      await tx
        .update(slotWindows)
        .set({ status: 'closed', closeReason: 'mistake', closedAt: at('09:00') })
        .where(eq(slotWindows.shopId, shop.shopId));
      expect(
        await violatedConstraint(tx, (t) =>
          insertSlotWindows(t, input([window('17:00', '19:00')])),
        ),
      ).toBeUndefined();
      // 다른 샵은 같은 시간이어도 괜찮다
      expect(
        await violatedConstraint(tx, (t) =>
          insertSlotWindows(t, input([window('10:00', '11:00')], other)),
        ),
      ).toBeUndefined();
    });
  });

  it('지난 설정: 가장 늦게 올린 시간대의 서비스·할인율과 신규 고객 전용, 숨긴 메뉴는 빼고 메뉴 순서대로', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      expect(await readLastWindowSettings(tx, shop.shopId)).toBeNull();

      const perm = await addMenu(tx, shop, '펌', 1);
      const color = await addMenu(tx, shop, '염색', 2);
      const insertWindow = async (start: string, createdAt: string, newCustomerOnly: boolean) => {
        const [row] = await tx
          .insert(slotWindows)
          .values({
            shopId: shop.shopId,
            startAt: at(start),
            endAt: new Date(at(start).getTime() + 3 * 60 * 60 * 1000),
            publishAt: at('08:00'),
            status: 'published',
            newCustomerOnly,
            createdBy: shop.createdBy,
            createdAt: at(createdAt),
          })
          .returning();
        return row;
      };
      const older = await insertWindow('09:00', '07:00', false);
      const newer = await insertWindow('13:00', '07:30', true);
      const item = (windowId: string, menuId: string, name: string, discountRate: number) => ({
        windowId,
        menuId,
        serviceType: 'perm',
        menuName: name,
        listPrice: 80_000,
        durationMinutes: 120,
        discountRate,
        salePrice: 80_000 - (80_000 * discountRate) / 100,
      });
      await tx
        .insert(slotWindowMenus)
        .values([
          item(older.id, shop.menuId, '커트', 10),
          item(newer.id, color.id, '염색', 40),
          item(newer.id, shop.menuId, '커트', 30),
          item(newer.id, perm.id, '펌', 20),
        ]);
      await tx
        .update(menus)
        .set({ hiddenAt: at('07:40') })
        .where(eq(menus.id, perm.id));

      expect(await readLastWindowSettings(tx, shop.shopId)).toEqual({
        menus: [
          { menuId: shop.menuId, discountRate: 30 },
          { menuId: color.id, discountRate: 40 },
        ],
        newCustomerOnly: true,
      });

      // 남은 서비스가 모두 숨겨지면 채워 둘 것이 없다
      await tx
        .update(menus)
        .set({ hiddenAt: at('07:50') })
        .where(eq(menus.shopId, shop.shopId));
      expect(await readLastWindowSettings(tx, shop.shopId)).toBeNull();
    });
  });

  it('마감: 내 샵의 끝나지 않은 시간대만 사유·시각을 남기고, 남의 것·없는 것은 NOT_FOUND, 이미 마감·끝난 것은 CLOSED', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const other = await createTestShop(tx, { status: 'approved' });
      const [open, ended] = await insertSlotWindows(tx, {
        shopId: shop.shopId,
        createdBy: shop.createdBy,
        newCustomerOnly: false,
        windows: [window('09:00', '11:00'), window('13:00', '18:00')],
        menus: [cutMenu(shop)],
      }).then((rows) => [rows[1], rows[0]]);
      const now = at('12:00');
      const close = (shopId: string, windowId: string) =>
        closeWindow(tx, { shopId, windowId, reason: 'other_channel', now });

      expect(await close(other.shopId, open.id)).toEqual({ ok: false, code: 'WINDOW_NOT_FOUND' });
      expect(await close(shop.shopId, crypto.randomUUID())).toEqual({
        ok: false,
        code: 'WINDOW_NOT_FOUND',
      });
      expect(await close(shop.shopId, ended.id)).toEqual({ ok: false, code: 'WINDOW_CLOSED' });

      expect(await close(shop.shopId, open.id)).toEqual({ ok: true, closedAt: now, keptSlots: [] });
      const [row] = await tx.select().from(slotWindows).where(eq(slotWindows.id, open.id));
      expect([row.status, row.closeReason, row.closedAt]).toEqual(['closed', 'other_channel', now]);

      expect(await close(shop.shopId, open.id)).toEqual({ ok: false, code: 'WINDOW_CLOSED' });
    });
  });
  it('마감: 결제 없이 끝난 칸은 같이 닫고, 손님이 결제 중인 칸(홀딩 중·결제 확인 대기)은 남겨서 돌려준다(#308 ③-2)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const [saved] = await insertSlotWindows(tx, {
        shopId: shop.shopId,
        createdBy: shop.createdBy,
        newCustomerOnly: false,
        windows: [window('13:00', '18:00')],
        menus: [cutMenu(shop)],
      });
      const now = at('12:00');
      const inWindow = { windowId: saved.id, holdCustomerId: customerId };
      const [holding, stale, paying, reserved] = await tx
        .insert(slots)
        .values([
          testSlot(shop, '13:00', '14:00', { ...inWindow, holdExpiresAt: at('12:05') }),
          testSlot(shop, '14:00', '15:00', { ...inWindow, holdExpiresAt: at('11:55') }),
          testSlot(shop, '15:00', '16:00', { ...inWindow, holdExpiresAt: at('11:55') }),
          testSlot(shop, '16:00', '17:00', { windowId: saved.id, status: 'reserved' }),
        ])
        .returning({ id: slots.id });
      await tx.insert(orders).values({
        paymentId: `test_${crypto.randomUUID()}`,
        slotId: paying.id,
        customerId,
        salePrice: 14_000,
        amount: 14_000,
        refundPolicyVersion: 'test',
        refundPolicyAgreedAt: now,
        status: 'pending',
      });

      const closed = await closeWindow(tx, {
        shopId: shop.shopId,
        windowId: saved.id,
        reason: 'other_channel',
        now,
      });
      expect(closed).toEqual({
        ok: true,
        closedAt: now,
        keptSlots: [
          {
            slotId: holding.id,
            startAt: at('13:00'),
            endAt: at('14:00'),
            menuName: '커트',
            holdExpiresAt: at('12:05'),
          },
          {
            slotId: paying.id,
            startAt: at('15:00'),
            endAt: at('16:00'),
            menuName: '커트',
            holdExpiresAt: at('11:55'),
          },
        ],
      });
      const statusOf = async (slotId: string) => {
        const [row] = await tx
          .select({ status: slots.status, closeReason: slots.closeReason })
          .from(slots)
          .where(eq(slots.id, slotId));
        return [row.status, row.closeReason];
      };
      expect(await statusOf(stale.id)).toEqual(['closed', 'hold_released']);
      expect(await statusOf(reserved.id)).toEqual(['reserved', null]);

      // 남긴 칸이 결제 없이 끝나 닫히면 그 칸만 원장님 알림 대상이다(마감할 때 같이 닫힌 칸은 아니다)
      await closeStaleWindowHolds(tx, { now: at('12:30') });
      expect(await statusOf(holding.id)).toEqual(['closed', 'hold_released']);
      expect(
        await readReleasedKeptSlots(tx, [holding.id, stale.id, paying.id, reserved.id]),
      ).toEqual([
        {
          slotId: holding.id,
          ownerUserId: shop.createdBy,
          menuName: '커트',
          startAt: at('13:00'),
          endAt: at('14:00'),
        },
      ]);
      expect(await readReleasedKeptSlots(tx, [])).toEqual([]);
    });
  });
});
