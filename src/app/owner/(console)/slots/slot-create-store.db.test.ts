// 매물 등록 저장이 ①②③ 검증 뒤 약속한 값으로 한 건만 저장하는지 실제 DB로 본다(O5, S-201·S-203·S-205·S-209).
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { menus, slots } from '@/db/schema';

import { createTestShop, testSlot } from '../../../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../../../tests/db/test-db';
import { createSlotInDb } from './slot-create-store';

afterAll(closeTestDb);

// 매물 날짜(2026-11-01) 전날 낮. 11/01 전체가 48시간 안이다
const now = new Date('2026-10-31T12:00:00+09:00');
const at = (hm: string) => new Date(`2026-11-01T${hm}:00+09:00`).toISOString();

describeDb('매물 등록 저장 (실제 DB)', () => {
  it('메뉴 값을 복사하고 할인가를 서버가 계산해 게시중으로 저장한다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      // docs/settlement-examples.md와 같은 정가: 33,500원 30% → 23,450원(100원 올림 없음)
      await tx
        .update(menus)
        .set({ listPrice: 33500, description: '샴푸 포함' })
        .where(eq(menus.id, shop.menuId));

      const result = await createSlotInDb(
        tx,
        shop.shopId,
        shop.createdBy,
        { menuId: shop.menuId, startAt: at('14:00'), discountRate: 30, newCustomerOnly: true },
        now,
      );
      // 48시간 안이라 지금 게시중이고, 게시 시각을 따로 알려 주지 않는다
      expect(result).toMatchObject({ ok: true, data: { salePrice: 23450, publishAt: null } });
      if (!result.ok) return;

      const [row] = await tx.select().from(slots).where(eq(slots.id, result.data.slotId));
      expect(row).toMatchObject({
        shopId: shop.shopId,
        menuId: shop.menuId,
        serviceType: 'cut',
        menuName: '커트',
        menuDescription: '샴푸 포함',
        listPrice: 33500,
        durationMinutes: 60,
        discountRate: 30,
        salePrice: 23450,
        newCustomerOnly: true,
        startAt: new Date(at('14:00')),
        endAt: new Date(at('15:00')),
        publishAt: now,
        status: 'published',
        createdBy: shop.createdBy,
      });

      // 메뉴를 고쳐도 매물은 등록 당시 값 그대로다(D12)
      await tx.update(menus).set({ listPrice: 40000 }).where(eq(menus.id, shop.menuId));
      const [after] = await tx.select().from(slots).where(eq(slots.id, result.data.slotId));
      expect(after.listPrice).toBe(33500);
    });
  });

  it('선택지에 없는 할인율이면 저장하지 않는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const create = (discountRate: unknown) =>
        createSlotInDb(
          tx,
          shop.shopId,
          shop.createdBy,
          { menuId: shop.menuId, startAt: at('14:00'), discountRate, newCustomerOnly: false },
          now,
        );
      expect(await create(15)).toMatchObject({ error: { code: 'INVALID_DISCOUNT_RATE' } });
      expect(await create(60)).toMatchObject({ error: { code: 'INVALID_DISCOUNT_RATE' } });
      expect(await tx.select().from(slots).where(eq(slots.shopId, shop.shopId))).toHaveLength(0);
    });
  });

  it('미리 올리기: 시작이 48시간보다 멀면 예약대기로, 시작 48시간 전을 게시 시각으로 저장한다(S-205)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const startAt = '2026-11-05T05:00:00.000Z'; // 11/05(목) 14:00
      const result = await createSlotInDb(
        tx,
        shop.shopId,
        shop.createdBy,
        { menuId: shop.menuId, startAt, discountRate: 20, newCustomerOnly: false },
        now,
      );
      const publishAt = new Date('2026-11-03T14:00:00+09:00');
      expect(result).toMatchObject({ ok: true, data: { publishAt: publishAt.toISOString() } });
      if (!result.ok) return;
      const [row] = await tx.select().from(slots).where(eq(slots.id, result.data.slotId));
      expect(row).toMatchObject({ status: 'scheduled', publishAt, startAt: new Date(startAt) });
    });
  });

  it('①② 검증(14일·겹침)을 저장할 때 다시 한다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      await tx.insert(slots).values(testSlot(shop, '10:00', '11:00'));
      const create = (startAt: string) =>
        createSlotInDb(
          tx,
          shop.shopId,
          shop.createdBy,
          { menuId: shop.menuId, startAt, discountRate: 20, newCustomerOnly: false },
          now,
        );
      expect(await create(at('10:30'))).toMatchObject({ error: { code: 'SLOT_OVERLAP' } });
      // 지금(10/31 12:00)부터 14일 뒤(11/14 12:00)를 30분 넘긴 시각
      expect(await create('2026-11-14T03:30:00.000Z')).toMatchObject({
        error: { code: 'TOO_FAR' },
      });
    });
  });

  it('같은 요청을 두 번 보내도 매물은 하나만 생긴다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const input = {
        menuId: shop.menuId,
        startAt: at('14:00'),
        discountRate: 30,
        newCustomerOnly: false,
      };
      expect((await createSlotInDb(tx, shop.shopId, shop.createdBy, input, now)).ok).toBe(true);
      expect(await createSlotInDb(tx, shop.shopId, shop.createdBy, input, now)).toMatchObject({
        ok: false,
        error: { code: 'SLOT_OVERLAP' },
      });
      expect(await tx.select().from(slots).where(eq(slots.shopId, shop.shopId))).toHaveLength(1);
    });
  });
});
