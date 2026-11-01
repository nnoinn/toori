// 매물 등록 저장이 ①②③ 검증 뒤 약속한 값으로 한 건만 저장하는지 실제 DB로 본다(O5, S-201·S-203·S-209).
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { menus, slots } from '@/db/schema';

import { createTestShop, testSlot } from '../../../../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../../../../tests/db/test-db';
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
      expect(result).toMatchObject({ ok: true, data: { salePrice: 23450 } });
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

  it('①② 검증(48시간·겹침)을 저장할 때 다시 한다', async () => {
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
      expect(await create('2026-11-02T04:00:00.000Z')).toMatchObject({
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
