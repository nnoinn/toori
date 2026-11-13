// 시간대 [예약하기] 홀딩 저장(acquireWindowHold)과 결제 없이 끝난 칸 닫기(closeStaleWindowHolds)를 실제 DB(TEST_DATABASE_URL이
// 있을 때만)로 확인한다 (#308 ③). 함수 결과를 실패 코드로 바꾸는 것은 windows.test.ts가 본다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { orders, slots, slotWindows } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  type TestShop,
  testSlot,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import { acquireWindowHold } from './hold-store';
import { closeStaleWindowHolds, insertSlotWindows } from './store';

/** 'HH:MM'(2026-11-01, 한국 시간, fixtures testSlot과 같은 날) */
const at = (hm: string) => new Date(`2026-11-01T${hm}:00+09:00`);
const NOW = at('09:00');
const MINUTE = 60 * 1000;
const later = (minutes: number) => new Date(NOW.getTime() + minutes * MINUTE);
const PUBLISHED_AT = new Date('2026-10-30T10:00:00+09:00');

/** 13:00~18:00 게시중 시간대, 샵의 커트(60분)를 30%(20,000원 → 14,000원)로 올린다 */
async function addWindow(tx: TestTx, shop: TestShop, extra: { newCustomerOnly?: boolean } = {}) {
  const [window] = await insertSlotWindows(tx, {
    shopId: shop.shopId,
    createdBy: shop.createdBy,
    newCustomerOnly: extra.newCustomerOnly ?? false,
    windows: [
      { start: at('13:00'), end: at('18:00'), publishAt: PUBLISHED_AT, status: 'published' },
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
    ],
  });
  return window.id;
}

/** 결제 대기 주문(결제창을 연 뒤 결과가 아직 정해지지 않음) */
async function addPendingOrder(tx: TestTx, slotId: string, customerId: string) {
  await tx.insert(orders).values({
    paymentId: `test_${crypto.randomUUID()}`,
    slotId,
    customerId,
    salePrice: 14_000,
    amount: 14_000,
    refundPolicyVersion: 'test',
    refundPolicyAgreedAt: NOW,
    status: 'pending',
  });
}

async function slotRow(tx: TestTx, slotId: string) {
  const [row] = await tx.select().from(slots).where(eq(slots.id, slotId));
  return row;
}

describeDb('시간대 [예약하기] 홀딩과 결제 없이 끝난 칸 닫기 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('고른 서비스·시작 시각으로 시간대 안에 매물 한 칸을 만들어 10분 홀딩한다(올릴 때 값, 시간대를 올린 원장님)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const windowId = await addWindow(tx, shop);

      const held = await acquireWindowHold(tx, {
        windowId,
        menuId: shop.menuId,
        startAt: at('14:00'),
        customerId,
        now: NOW,
      });
      expect(held).toEqual({ ok: true, slotId: expect.any(String), holdExpiresAt: later(10) });
      expect(await slotRow(tx, (held as { slotId: string }).slotId)).toMatchObject({
        shopId: shop.shopId,
        windowId,
        menuId: shop.menuId,
        serviceType: 'cut',
        menuName: '커트',
        listPrice: 20_000,
        durationMinutes: 60,
        discountRate: 30,
        salePrice: 14_000,
        newCustomerOnly: false,
        startAt: at('14:00'),
        endAt: at('15:00'),
        publishAt: PUBLISHED_AT,
        status: 'published',
        holdCustomerId: customerId,
        holdExpiresAt: later(10),
        createdBy: shop.createdBy,
      });
    });
  });

  it('같은 서비스·시각을 다시 누르면 그 홀딩 그대로, 다른 시각은 ALREADY_HOLDING(한 사람은 하나만)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const windowId = await addWindow(tx, shop);
      const hold = (startAt: Date, now: Date) =>
        acquireWindowHold(tx, { windowId, menuId: shop.menuId, startAt, customerId, now });

      const first = await hold(at('14:00'), NOW);
      expect(await hold(at('14:00'), later(3))).toEqual(first);
      const slotId = (first as { slotId: string }).slotId;
      expect(await hold(at('16:00'), later(3))).toEqual({
        ok: false,
        code: 'ALREADY_HOLDING',
        heldSlotId: slotId,
      });
      const inWindow = await tx.select().from(slots).where(eq(slots.windowId, windowId));
      expect(inWindow.map((row) => row.id)).toEqual([slotId]);
    });
  });

  it('다른 손님이 잡은 시간과 겹치거나, 30분 단위가 아니거나, 끝이 시간대를 넘거나, 지난 시각이면 TIME_TAKEN', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const a = await createTestCustomer(tx);
      const b = await createTestCustomer(tx);
      const windowId = await addWindow(tx, shop);
      const hold = (customerId: string, startAt: Date, now = NOW) =>
        acquireWindowHold(tx, { windowId, menuId: shop.menuId, startAt, customerId, now });

      expect((await hold(a.customerId, at('14:00'))).ok).toBe(true);
      for (const startAt of [at('14:30'), at('14:10'), at('17:30')]) {
        expect(await hold(b.customerId, startAt)).toEqual({ ok: false, code: 'TIME_TAKEN' });
      }
      expect(await hold(b.customerId, at('13:00'), at('13:00'))).toEqual({
        ok: false,
        code: 'TIME_TAKEN',
      });
      expect((await hold(b.customerId, at('15:00'))).ok).toBe(true);
    });
  });

  it('결제 없이 홀딩이 끝난 칸은 다른 손님이 고를 때 마감(hold_released)으로 닫고 그 시간을 판다. 결제 대기 주문이 있으면 닫지 않는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const a = await createTestCustomer(tx);
      const b = await createTestCustomer(tx);
      const c = await createTestCustomer(tx);
      const d = await createTestCustomer(tx);
      const windowId = await addWindow(tx, shop);
      const hold = (customerId: string, startAt: Date, now: Date) =>
        acquireWindowHold(tx, { windowId, menuId: shop.menuId, startAt, customerId, now });

      const expired = (await hold(a.customerId, at('14:00'), NOW)) as { slotId: string };
      const paying = (await hold(c.customerId, at('16:00'), NOW)) as { slotId: string };
      await addPendingOrder(tx, paying.slotId, c.customerId);

      expect((await hold(b.customerId, at('14:00'), later(11))).ok).toBe(true);
      expect(await slotRow(tx, expired.slotId)).toMatchObject({
        status: 'closed',
        closeReason: 'hold_released',
        closedAt: later(11),
      });
      // 결제는 했는데 확인이 늦을 수 있어서 결과가 나올 때까지 그 시간을 막는다
      expect(await hold(d.customerId, at('16:00'), later(11))).toEqual({
        ok: false,
        code: 'TIME_TAKEN',
      });
      expect(await slotRow(tx, paying.slotId)).toMatchObject({ status: 'published' });
    });
  });

  it('볼 수 없는 시간대(마감·게시 전·승인 안 된 샵)와 시간대에 없는 서비스는 SLOT_NOT_AVAILABLE, 신규 고객 전용은 그 샵 이력이 있으면 NEW_CUSTOMER_ONLY', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const pending = await createTestShop(tx, { status: 'pending' });
      const fresh = await createTestCustomer(tx);
      const visited = await createTestCustomer(tx);
      await createTestReservation(tx, shop, visited.customerId, '09:00', '10:00', 'completed');
      const hold = (windowId: string, customerId: string, menuId = shop.menuId) =>
        acquireWindowHold(tx, { windowId, menuId, startAt: at('14:00'), customerId, now: NOW });
      const notAvailable = { ok: false, code: 'SLOT_NOT_AVAILABLE' };

      const onlyNew = await addWindow(tx, shop, { newCustomerOnly: true });
      expect(await hold(onlyNew, fresh.customerId, crypto.randomUUID())).toEqual(notAvailable);
      expect(await hold(onlyNew, visited.customerId)).toEqual({
        ok: false,
        code: 'NEW_CUSTOMER_ONLY',
      });
      expect((await hold(onlyNew, fresh.customerId)).ok).toBe(true);

      const other = await createTestCustomer(tx);
      await tx
        .update(slotWindows)
        .set({ status: 'closed', closeReason: 'mistake', closedAt: NOW })
        .where(eq(slotWindows.id, onlyNew));
      expect(await hold(onlyNew, other.customerId)).toEqual(notAvailable);

      // 같은 샵에는 결제 중인 칸(14:00)이 있어서 겹치는 시간대를 새로 올릴 수 없다. 다른 샵에 올린다
      const another = await createTestShop(tx, { status: 'approved' });
      const notYet = await addWindow(tx, another);
      await tx
        .update(slotWindows)
        .set({ status: 'scheduled', publishAt: later(30) })
        .where(eq(slotWindows.id, notYet));
      expect(await hold(notYet, other.customerId, another.menuId)).toEqual(notAvailable);
      expect(await hold(await addWindow(tx, pending), other.customerId, pending.menuId)).toEqual(
        notAvailable,
      );
      expect(await hold(crypto.randomUUID(), other.customerId)).toEqual(notAvailable);
    });
  });

  it('결제 정리 작업: 결제 없이 홀딩이 끝난 시간대 칸만 닫고, 홀딩 중·결제 대기 주문·예약됨·한 시술 매물은 그대로', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const windowId = await addWindow(tx, shop);
      const insert = async (
        start: string,
        end: string,
        extra: Partial<typeof slots.$inferInsert>,
      ) => {
        const [row] = await tx
          .insert(slots)
          .values(testSlot(shop, start, end, extra))
          .returning({ id: slots.id });
        return row.id;
      };
      const inWindow = { windowId, holdCustomerId: customerId };
      const expired = await insert('13:00', '14:00', { ...inWindow, holdExpiresAt: later(-1) });
      const holding = await insert('14:00', '15:00', { ...inWindow, holdExpiresAt: later(5) });
      const paying = await insert('15:00', '16:00', { ...inWindow, holdExpiresAt: later(-1) });
      await addPendingOrder(tx, paying, customerId);
      const reserved = await insert('16:00', '17:00', { windowId, status: 'reserved' });
      // 한 시술 매물은 홀딩이 끝나도 그대로 게시중이다(다른 손님이 홀딩할 수 있다)
      const single = await insert('10:00', '11:00', {
        holdCustomerId: customerId,
        holdExpiresAt: later(-1),
      });

      expect(await closeStaleWindowHolds(tx, { now: NOW })).toContainEqual({
        slotId: expired,
        windowId,
      });
      const statuses = await tx
        .select({ id: slots.id, status: slots.status, closeReason: slots.closeReason })
        .from(slots)
        .where(eq(slots.shopId, shop.shopId));
      expect(new Map(statuses.map((row) => [row.id, [row.status, row.closeReason]]))).toEqual(
        new Map([
          [expired, ['closed', 'hold_released']],
          [holding, ['published', null]],
          [paying, ['published', null]],
          [reserved, ['reserved', null]],
          [single, ['published', null]],
        ]),
      );
      // 다시 불러도 같은 결과(이미 닫은 칸은 다시 닫지 않는다)
      expect(await closeStaleWindowHolds(tx, { now: NOW, windowId })).toEqual([]);
    });
  });
});
