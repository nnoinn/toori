// 매물 수정·마감 저장이 판매 전·결제 중 아닌 매물만 바꾸는지 실제 DB로 본다(O10, S-206·S-209, #57).
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { menus, slots } from '@/db/schema';

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
import { closeSlotInDb, updateSlotInDb } from './slot-edit-store';

afterAll(closeTestDb);

// 매물 날짜(2026-11-01, testSlot) 전날 낮. 11/01 전체가 48시간 안이다
const now = new Date('2026-10-31T12:00:00+09:00');
const at = (hm: string) => new Date(`2026-11-01T${hm}:00+09:00`);

async function slotRow(tx: TestTx, slotId: string) {
  const [row] = await tx.select().from(slots).where(eq(slots.id, slotId));
  return row;
}

/** 지금 홀딩 중인 매물(만료 5분 전) */
async function heldSlot(tx: TestTx, shop: TestShop) {
  const customer = await createTestCustomer(tx);
  const [slot] = await tx
    .insert(slots)
    .values(
      testSlot(shop, '10:00', '11:00', {
        holdCustomerId: customer.customerId,
        holdExpiresAt: new Date(now.getTime() + 5 * 60_000),
      }),
    )
    .returning();
  return slot;
}

describeDb('매물 마감 (실제 DB)', () => {
  it('게시중·예약대기 매물을 사유·시각과 함께 마감하고, 그 시간에 새 매물을 올릴 수 있다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const [published, scheduled] = await tx
        .insert(slots)
        .values([
          testSlot(shop, '10:00', '11:00'),
          testSlot(shop, '14:00', '15:00', {
            status: 'scheduled',
            publishAt: new Date('2026-11-01T00:00:00+09:00'),
          }),
        ])
        .returning();

      expect(await closeSlotInDb(tx, shop.shopId, published.id, 'other_channel', now)).toEqual({
        ok: true,
        data: null,
      });
      expect(await slotRow(tx, published.id)).toMatchObject({
        status: 'closed',
        closedAt: now,
        closeReason: 'other_channel',
      });
      expect((await closeSlotInDb(tx, shop.shopId, scheduled.id, 'mistake', now)).ok).toBe(true);

      // 마감한 매물은 겹침 제약(slots_no_overlap)에서 빠진다
      await expect(
        tx.insert(slots).values(testSlot(shop, '10:00', '11:00')),
      ).resolves.toBeDefined();
    });
  });

  it('예약됨·결제 중·이미 마감·시작 지남·다른 샵·사유 없음은 마감하지 않는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const other = await createTestShop(tx);
      const customer = await createTestCustomer(tx);
      const { slot: reserved } = await createTestReservation(
        tx,
        shop,
        customer.customerId,
        '12:00',
        '13:00',
        'confirmed',
      );
      const held = await heldSlot(tx, shop);
      const [closed, otherSlot] = await tx
        .insert(slots)
        .values([
          testSlot(shop, '15:00', '16:00', { status: 'closed', closeReason: 'mistake' }),
          testSlot(other, '10:00', '11:00'),
        ])
        .returning();
      const close = (slotId: string, reason: unknown = 'other', when = now) =>
        closeSlotInDb(tx, shop.shopId, slotId, reason, when);

      expect(await close(reserved.id)).toMatchObject({ error: { code: 'SLOT_RESERVED' } });
      expect(await close(held.id)).toMatchObject({ error: { code: 'SLOT_ON_HOLD' } });
      expect(await close(closed.id)).toMatchObject({ error: { code: 'SLOT_CLOSED' } });
      expect(await close(otherSlot.id)).toMatchObject({ error: { code: 'SLOT_NOT_FOUND' } });
      expect(await close('not-a-uuid')).toMatchObject({ error: { code: 'SLOT_NOT_FOUND' } });
      expect(await close(held.id, 'deleted')).toMatchObject({
        error: { code: 'INVALID_CLOSE_REASON' },
      });
      // 시작 시각(10:00)이 지난 매물은 이미 마감으로 본다
      expect(await close(held.id, 'other', at('10:30'))).toMatchObject({
        error: { code: 'SLOT_CLOSED' },
      });

      expect(await slotRow(tx, reserved.id)).toMatchObject({ status: 'reserved', closedAt: null });
      expect(await slotRow(tx, held.id)).toMatchObject({ status: 'published', closedAt: null });
      expect(await slotRow(tx, otherSlot.id)).toMatchObject({ status: 'published' });
    });
  });

  it('홀딩이 만료됐으면 마감할 수 있다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const held = await heldSlot(tx, shop);
      const afterHold = new Date(now.getTime() + 5 * 60_000);
      expect((await closeSlotInDb(tx, shop.shopId, held.id, 'other', afterHold)).ok).toBe(true);
    });
  });
});

describeDb('매물 수정 (실제 DB)', () => {
  it('자기 자신과 겹치는 시각으로 옮기고, 메뉴 값을 다시 복사해 할인가를 다시 계산한다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const [slot] = await tx
        .insert(slots)
        .values(testSlot(shop, '10:00', '11:00'))
        .returning();
      // docs/settlement-examples.md와 같은 정가: 33,500원 30% → 23,450원(100원 올림 없음)
      await tx.update(menus).set({ listPrice: 33500 }).where(eq(menus.id, shop.menuId));

      const result = await updateSlotInDb(
        tx,
        shop.shopId,
        slot.id,
        {
          menuId: shop.menuId,
          startAt: at('10:30').toISOString(),
          discountRate: 30,
          newCustomerOnly: true,
        },
        now,
      );
      expect(result).toEqual({
        ok: true,
        data: { slotId: slot.id, salePrice: 23450, publishAt: null },
      });
      expect(await slotRow(tx, slot.id)).toMatchObject({
        startAt: at('10:30'),
        endAt: at('11:30'),
        listPrice: 33500,
        discountRate: 30,
        salePrice: 23450,
        newCustomerOnly: true,
        // 이미 게시중인 매물은 게시 시각을 그대로 둔다(관심 지역 새 매물 알림에 다시 나가지 않게)
        publishAt: slot.publishAt,
        status: 'published',
      });
    });
  });

  it('예약대기 매물을 48시간 안으로 고치면 지금 게시중으로 바뀐다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const [slot] = await tx
        .insert(slots)
        .values(
          testSlot(shop, '14:00', '15:00', {
            status: 'scheduled',
            publishAt: new Date('2026-11-01T00:00:00+09:00'),
          }),
        )
        .returning();

      const result = await updateSlotInDb(
        tx,
        shop.shopId,
        slot.id,
        {
          menuId: shop.menuId,
          startAt: at('14:00').toISOString(),
          discountRate: 20,
          newCustomerOnly: false,
        },
        now,
      );
      expect(result.ok).toBe(true);
      expect(await slotRow(tx, slot.id)).toMatchObject({
        publishAt: now,
        status: 'published',
        discountRate: 20,
      });
    });
  });

  it('예약대기 매물은 14일 안의 먼 시각으로 옮기면 게시 시각을 새 시작 48시간 전으로 다시 정한다(S-205)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const [slot] = await tx
        .insert(slots)
        .values(
          testSlot(shop, '14:00', '15:00', {
            status: 'scheduled',
            publishAt: new Date('2026-11-01T00:00:00+09:00'),
          }),
        )
        .returning();

      const startAt = '2026-11-05T05:00:00.000Z'; // 11/05(목) 14:00
      const result = await updateSlotInDb(
        tx,
        shop.shopId,
        slot.id,
        { menuId: shop.menuId, startAt, discountRate: 20, newCustomerOnly: false },
        now,
      );
      const publishAt = new Date('2026-11-03T14:00:00+09:00');
      expect(result).toMatchObject({ ok: true, data: { publishAt: publishAt.toISOString() } });
      expect(await slotRow(tx, slot.id)).toMatchObject({
        startAt: new Date(startAt),
        publishAt,
        status: 'scheduled',
      });
    });
  });

  it('게시중 매물은 48시간 밖으로 옮기지 못한다(다시 예약대기로 숨지 않게, 11/9)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const [slot] = await tx
        .insert(slots)
        .values(testSlot(shop, '10:00', '11:00'))
        .returning();
      const result = await updateSlotInDb(
        tx,
        shop.shopId,
        slot.id,
        {
          menuId: shop.menuId,
          startAt: '2026-11-05T05:00:00.000Z',
          discountRate: 20,
          newCustomerOnly: false,
        },
        now,
      );
      expect(result).toMatchObject({ ok: false, error: { code: 'TOO_FAR_PUBLISHED' } });
      expect(await slotRow(tx, slot.id)).toMatchObject({
        startAt: at('10:00'),
        status: 'published',
      });
    });
  });

  it('다른 매물과 겹치거나 등록 검증(14일·할인율)에 걸리면 고치지 않는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const [slot] = await tx
        .insert(slots)
        .values([testSlot(shop, '10:00', '11:00'), testSlot(shop, '12:00', '13:00')])
        .returning();
      const update = (startAt: string, discountRate: unknown = 20) =>
        updateSlotInDb(
          tx,
          shop.shopId,
          slot.id,
          { menuId: shop.menuId, startAt, discountRate, newCustomerOnly: false },
          now,
        );

      expect(await update(at('11:30').toISOString())).toMatchObject({
        error: { code: 'SLOT_OVERLAP' },
      });
      // 게시중 매물이라 48시간(11/02 12:00)을 넘기면 막는다
      expect(await update('2026-11-02T04:00:00.000Z')).toMatchObject({
        error: { code: 'TOO_FAR_PUBLISHED' },
      });
      expect(await update(at('10:00').toISOString(), 15)).toMatchObject({
        error: { code: 'INVALID_DISCOUNT_RATE' },
      });
      expect(await slotRow(tx, slot.id)).toMatchObject({ startAt: at('10:00'), discountRate: 30 });
    });
  });

  it('결제 중·예약됨·다른 샵 매물은 고치지 않는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const other = await createTestShop(tx);
      const customer = await createTestCustomer(tx);
      const held = await heldSlot(tx, shop);
      const { slot: reserved } = await createTestReservation(
        tx,
        shop,
        customer.customerId,
        '12:00',
        '13:00',
        'confirmed',
      );
      const [otherSlot] = await tx
        .insert(slots)
        .values(testSlot(other, '14:00', '15:00'))
        .returning();
      const update = (slotId: string, start: string) =>
        updateSlotInDb(
          tx,
          shop.shopId,
          slotId,
          {
            menuId: shop.menuId,
            startAt: at(start).toISOString(),
            discountRate: 50,
            newCustomerOnly: false,
          },
          now,
        );

      expect(await update(held.id, '10:00')).toMatchObject({ error: { code: 'SLOT_ON_HOLD' } });
      expect(await update(reserved.id, '12:00')).toMatchObject({
        error: { code: 'SLOT_RESERVED' },
      });
      expect(await update(otherSlot.id, '14:00')).toMatchObject({
        error: { code: 'SLOT_NOT_FOUND' },
      });
      expect(await slotRow(tx, held.id)).toMatchObject({ discountRate: 30 });
      expect(await slotRow(tx, reserved.id)).toMatchObject({ discountRate: 30 });
      expect(await slotRow(tx, otherSlot.id)).toMatchObject({ discountRate: 30 });
    });
  });
});
