// 원장님 튜토리얼 체크 목록(S-412)이 그 샵의 메뉴·매물 기록만 보고 단계를 정하는지 실제 DB로 본다.
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { menus, slots, slotWindows } from '@/db/schema';

import { createTestShop, testSlot } from '../../../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../../../tests/db/test-db';
import { selectTutorialProgress } from './tutorial-store';

afterAll(closeTestDb);

const kst = (value: string) => new Date(`${value.replace(' ', 'T')}:00+09:00`);

describeDb('원장님 튜토리얼 기록 조회 (실제 DB)', () => {
  it('메뉴가 있고 매물이 없으면 메뉴만 끝, 숨긴 메뉴만 있으면 메뉴도 아직', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      expect(await selectTutorialProgress(tx, shop.shopId)).toEqual({
        hasMenu: true,
        hasListed: false,
      });
      await tx.update(menus).set({ hiddenAt: new Date() }).where(eq(menus.id, shop.menuId));
      expect(await selectTutorialProgress(tx, shop.shopId)).toEqual({
        hasMenu: false,
        hasListed: false,
      });
    });
  });

  it('한 시술 매물을 한 번이라도 올렸으면 첫 매물은 끝(마감한 매물이어도)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      await tx
        .insert(slots)
        .values(testSlot(shop, '10:00', '11:00', { status: 'closed', closeReason: 'mistake' }));
      expect((await selectTutorialProgress(tx, shop.shopId)).hasListed).toBe(true);
    });
  });

  it('시간대 매물만 올렸어도 첫 매물은 끝', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      await tx.insert(slotWindows).values({
        shopId: shop.shopId,
        startAt: kst('2026-11-01 12:00'),
        endAt: kst('2026-11-01 16:00'),
        publishAt: kst('2026-10-30 12:00'),
        status: 'scheduled',
        createdBy: shop.createdBy,
      });
      expect((await selectTutorialProgress(tx, shop.shopId)).hasListed).toBe(true);
    });
  });

  it('다른 샵의 메뉴·매물은 보지 않는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const other = await createTestShop(tx);
      await tx.update(menus).set({ hiddenAt: new Date() }).where(eq(menus.id, shop.menuId));
      await tx.insert(slots).values(testSlot(other, '10:00', '11:00'));
      expect(await selectTutorialProgress(tx, shop.shopId)).toEqual({
        hasMenu: false,
        hasListed: false,
      });
    });
  });
});
