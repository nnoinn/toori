// 매물 등록 ①② 검증이 메뉴·시각·겹침을 약속대로 막는지 실제 DB로 본다(O4, S-204·S-209).
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { menus, shops, slots } from '@/db/schema';

import { createTestShop, testSlot } from '../../../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../../../tests/db/test-db';
import { selectBusyRanges, validateSlotDraft } from './slot-draft-store';

afterAll(closeTestDb);

// 매물 날짜(2026-11-01, testSlot) 전날 낮. 11/01 전체가 48시간 안이다
const now = new Date('2026-10-31T12:00:00+09:00');
const at = (hm: string) => new Date(`2026-11-01T${hm}:00+09:00`).toISOString();

describeDb('매물 등록 ①② 검증 (실제 DB)', () => {
  it('고른 메뉴로 끝 시각을 계산하고 메뉴 값을 돌려준다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const result = await validateSlotDraft(
        tx,
        shop.shopId,
        { menuId: shop.menuId, startAt: at('14:00') },
        now,
      );
      expect(result).toEqual({
        ok: true,
        data: {
          menu: expect.objectContaining({ id: shop.menuId, name: '커트', durationMinutes: 60 }),
          start: new Date(at('14:00')),
          end: new Date(at('15:00')),
        },
      });
    });
  });

  it('예약대기·게시중·예약됨과 겹치면 막고, 마감·취소·완료와는 겹쳐도 된다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      await tx
        .insert(slots)
        .values([
          testSlot(shop, '10:00', '11:00'),
          testSlot(shop, '12:00', '13:00', { status: 'reserved' }),
          testSlot(shop, '14:00', '15:00', { status: 'closed' }),
          testSlot(shop, '16:00', '17:00', { status: 'cancelled' }),
        ]);
      const draft = (startAt: string) =>
        validateSlotDraft(tx, shop.shopId, { menuId: shop.menuId, startAt }, now);

      expect((await draft(at('10:30'))).ok).toBe(false);
      expect(await draft(at('11:30'))).toMatchObject({
        ok: false,
        error: { code: 'SLOT_OVERLAP' },
      });
      // 끝 시각에 바로 이어지면 괜찮다
      expect((await draft(at('11:00'))).ok).toBe(true);
      expect((await draft(at('14:00'))).ok).toBe(true);
      expect((await draft(at('16:00'))).ok).toBe(true);

      expect(
        await selectBusyRanges(tx, shop.shopId, new Date(at('09:00')), new Date(at('18:00'))),
      ).toEqual([
        { start: new Date(at('10:00')), end: new Date(at('11:00')) },
        { start: new Date(at('12:00')), end: new Date(at('13:00')) },
      ]);
    });
  });

  it('다른 샵 매물과는 겹쳐도 된다', async () => {
    await withRollback(async (tx) => {
      const mine = await createTestShop(tx);
      const other = await createTestShop(tx);
      await tx.insert(slots).values(testSlot(other, '10:00', '11:00'));
      const result = await validateSlotDraft(
        tx,
        mine.shopId,
        { menuId: mine.menuId, startAt: at('10:00') },
        now,
      );
      expect(result.ok).toBe(true);
    });
  });

  it('다른 샵 메뉴, 숨긴 메뉴, 지금 업종에 없는 메뉴는 고를 수 없다', async () => {
    await withRollback(async (tx) => {
      const mine = await createTestShop(tx);
      const other = await createTestShop(tx);
      const draft = (menuId: string) =>
        validateSlotDraft(tx, mine.shopId, { menuId, startAt: at('10:00') }, now);

      expect(await draft(other.menuId)).toMatchObject({ error: { code: 'MENU_NOT_FOUND' } });

      await tx.update(shops).set({ category: 'nail_lash' }).where(eq(shops.id, mine.shopId));
      expect(await draft(mine.menuId)).toMatchObject({ error: { code: 'MENU_NOT_FOUND' } });

      await tx.update(shops).set({ category: 'hair' }).where(eq(shops.id, mine.shopId));
      await tx.update(menus).set({ hiddenAt: now }).where(eq(menus.id, mine.menuId));
      expect(await draft(mine.menuId)).toMatchObject({ error: { code: 'MENU_NOT_FOUND' } });
    });
  });

  it('영업시간을 입력한 요일은 영업시간 안에 끝나야 하고, 쉬는 날은 막는다', async () => {
    await withRollback(async (tx) => {
      // 2026-11-01은 일요일
      const shop = await createTestShop(tx, {
        businessHours: [{ weekday: 0, open: '10:00', close: '20:00' }],
      });
      const draft = (startAt: string) =>
        validateSlotDraft(tx, shop.shopId, { menuId: shop.menuId, startAt }, now);

      expect((await draft(at('10:00'))).ok).toBe(true);
      expect((await draft(at('19:00'))).ok).toBe(true);
      expect(await draft(at('19:10'))).toMatchObject({ error: { code: 'OUTSIDE_HOURS' } });
      expect(await draft(at('09:50'))).toMatchObject({ error: { code: 'OUTSIDE_HOURS' } });

      await tx
        .update(shops)
        .set({ businessHours: [{ weekday: 0, closed: true }] })
        .where(eq(shops.id, shop.shopId));
      expect(await draft(at('12:00'))).toMatchObject({ error: { code: 'CLOSED_DAY' } });
    });
  });

  it('지난 시각, 48시간 밖, 단위가 안 맞는 시각, 모양이 틀린 입력은 막는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const draft = (startAt: unknown) =>
        validateSlotDraft(tx, shop.shopId, { menuId: shop.menuId, startAt }, now);

      expect(await draft('2026-10-31T02:00:00.000Z')).toMatchObject({ error: { code: 'PAST' } });
      expect(await draft('2026-11-02T04:00:00.000Z')).toMatchObject({ error: { code: 'TOO_FAR' } });
      expect(await draft(at('10:05'))).toMatchObject({ error: { code: 'NOT_ON_STEP' } });
      expect(await draft('내일 10시')).toMatchObject({ error: { code: 'INVALID_INPUT' } });
    });
  });
});
