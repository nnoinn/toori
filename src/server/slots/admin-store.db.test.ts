// 운영자 매물 관리(#373 ④)의 저장을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 게시 멈춤·다시 열기와 새 등록 막기(assertShopCanPublish), 매물·시간대 매물 강제 마감의 막는 조건, 처리 기록, 샵 상세의 매물 관리 칸 읽기를 본다.

import { asc, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { selectShopSlotControl } from '@/app/admin/shops/slot-control-queries';
import { adminActions, shops, slots, slotWindows } from '@/db/schema';
import { assertShopCanPublish } from '@/server/shops/publish-pause';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  createTestUser,
  type TestShop,
  testSlot,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import {
  forceCloseSlotInTx,
  forceCloseWindowInTx,
  pausePublishingInTx,
  resumePublishingInTx,
} from './admin-store';

const at = (hm: string) => new Date(`2026-11-01T${hm}:00+09:00`);
/** 11/01 매물(10/30 10시 게시)이 게시중인 때 */
const NOW = new Date('2026-10-31T12:00:00+09:00');
const HOUR_MS = 60 * 60 * 1000;

async function actionsOn(tx: TestTx, targetId: string) {
  return (
    tx
      .select({
        adminId: adminActions.adminId,
        action: adminActions.action,
        targetType: adminActions.targetType,
        memo: adminActions.memo,
      })
      .from(adminActions)
      .where(eq(adminActions.targetId, targetId))
      // 한 트랜잭션 안이라 남긴 시각이 같다. 이름 순으로 본다
      .orderBy(asc(adminActions.action))
  );
}

async function insertSlot(
  tx: TestTx,
  shop: TestShop,
  start: string,
  end: string,
  extra: Partial<typeof slots.$inferInsert> = {},
) {
  const [row] = await tx
    .insert(slots)
    .values(testSlot(shop, start, end, extra))
    .returning({ id: slots.id });
  return row.id;
}

async function insertWindow(tx: TestTx, shop: TestShop, start: string, end: string) {
  const [row] = await tx
    .insert(slotWindows)
    .values({
      shopId: shop.shopId,
      startAt: at(start),
      endAt: at(end),
      publishAt: new Date('2026-10-30T10:00:00+09:00'),
      status: 'published',
      createdBy: shop.createdBy,
    })
    .returning({ id: slotWindows.id });
  return row.id;
}

describeDb('운영자 매물 관리 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('게시를 멈추면 새 등록이 PUBLISH_PAUSED로 막히고, 다시 열면 풀린다. 두 번째는 ALREADY_PAUSED·NOT_PAUSED, 처리 기록이 남는다', async () => {
    await withRollback(async (tx) => {
      const adminId = await createTestUser(tx);
      const shop = await createTestShop(tx, { status: 'approved' });
      const args = { shopId: shop.shopId, adminId, now: NOW };

      expect(await assertShopCanPublish(shop.shopId, tx)).toEqual({ ok: true, data: null });
      expect(await pausePublishingInTx(tx, { ...args, reason: '신고 확인 중' })).toEqual({
        ok: true,
        data: { shopId: shop.shopId, pausedAt: NOW },
      });
      const [paused] = await tx
        .select({ at: shops.publishPausedAt, reason: shops.publishPausedReason })
        .from(shops)
        .where(eq(shops.id, shop.shopId));
      expect(paused).toEqual({ at: NOW, reason: '신고 확인 중' });
      expect(await assertShopCanPublish(shop.shopId, tx)).toMatchObject({
        ok: false,
        error: { code: 'PUBLISH_PAUSED' },
      });
      expect(await selectShopSlotControl(tx, shop.shopId, NOW)).toMatchObject({
        pause: { pausedAt: NOW, reason: '신고 확인 중' },
      });
      expect(await pausePublishingInTx(tx, { ...args, reason: '다시' })).toMatchObject({
        error: { code: 'ALREADY_PAUSED' },
      });

      expect(await resumePublishingInTx(tx, { ...args, reason: '확인 끝' })).toMatchObject({
        ok: true,
      });
      expect(await assertShopCanPublish(shop.shopId, tx)).toEqual({ ok: true, data: null });
      expect(await selectShopSlotControl(tx, shop.shopId, NOW)).toMatchObject({ pause: null });
      expect(await resumePublishingInTx(tx, { ...args, reason: '다시' })).toMatchObject({
        error: { code: 'NOT_PAUSED' },
      });
      expect(
        await pausePublishingInTx(tx, { ...args, shopId: crypto.randomUUID(), reason: '확인' }),
      ).toMatchObject({ error: { code: 'SHOP_NOT_FOUND' } });

      expect(await actionsOn(tx, shop.shopId)).toEqual([
        { adminId, action: 'shop.publish_pause', targetType: 'shop', memo: '신고 확인 중' },
        { adminId, action: 'shop.publish_resume', targetType: 'shop', memo: '확인 끝' },
      ]);
    });
  });

  describe('매물 강제 마감', () => {
    it('게시중·게시예정 매물은 운영자 마감으로 닫고 slot.force_close를 남긴다. 결제 중·예약됨·이미 마감·시간대 칸·없는 매물은 막는다', async () => {
      await withRollback(async (tx) => {
        const adminId = await createTestUser(tx);
        const shop = await createTestShop(tx, { status: 'approved' });
        const { customerId } = await createTestCustomer(tx);
        const close = (slotId: string) =>
          forceCloseSlotInTx(tx, { slotId, adminId, reason: '가격이 실제와 다름', now: NOW });

        const published = await insertSlot(tx, shop, '09:00', '10:00');
        const scheduled = await insertSlot(tx, shop, '10:00', '11:00', {
          status: 'scheduled',
          publishAt: new Date(NOW.getTime() + HOUR_MS),
        });
        const onHold = await insertSlot(tx, shop, '11:00', '12:00', {
          holdCustomerId: customerId,
          holdExpiresAt: new Date(NOW.getTime() + 5 * 60 * 1000),
        });
        const reserved = await createTestReservation(
          tx,
          shop,
          customerId,
          '12:00',
          '13:00',
          'confirmed',
        );
        const windowId = await insertWindow(tx, shop, '14:00', '17:00');
        const cell = await insertSlot(tx, shop, '14:00', '15:00', { windowId });

        expect(await close(published)).toEqual({
          ok: true,
          data: { slotId: published, closedAt: NOW },
        });
        const [closed] = await tx
          .select({
            status: slots.status,
            closeReason: slots.closeReason,
            closedAt: slots.closedAt,
          })
          .from(slots)
          .where(eq(slots.id, published));
        expect(closed).toEqual({ status: 'closed', closeReason: 'admin', closedAt: NOW });
        expect(await close(scheduled)).toMatchObject({ ok: true });

        expect(await close(onHold)).toMatchObject({ error: { code: 'SLOT_ON_HOLD' } });
        expect(await close(reserved.slot.id)).toMatchObject({ error: { code: 'SLOT_NOT_OPEN' } });
        expect(await close(published)).toMatchObject({ error: { code: 'SLOT_NOT_OPEN' } });
        expect(await close(cell)).toMatchObject({ error: { code: 'WINDOW_SLOT' } });
        expect(await close(crypto.randomUUID())).toMatchObject({
          error: { code: 'SLOT_NOT_FOUND' },
        });

        expect(await actionsOn(tx, published)).toEqual([
          { adminId, action: 'slot.force_close', targetType: 'slot', memo: '가격이 실제와 다름' },
        ]);
        expect(await actionsOn(tx, onHold)).toEqual([]);
      });
    });
  });

  describe('시간대 매물 강제 마감', () => {
    it('원장님 마감과 같이 닫고(사유 admin) 손님이 결제 중인 칸은 남기며, 매물 관리 칸에서 빠진다. 이미 마감·없는 시간대는 막는다', async () => {
      await withRollback(async (tx) => {
        const adminId = await createTestUser(tx);
        const shop = await createTestShop(tx, { status: 'approved' });
        const { customerId } = await createTestCustomer(tx);
        const windowId = await insertWindow(tx, shop, '13:00', '17:00');
        const other = await insertWindow(tx, shop, '09:00', '12:00');
        const kept = await insertSlot(tx, shop, '13:00', '14:00', {
          windowId,
          holdCustomerId: customerId,
          holdExpiresAt: new Date(NOW.getTime() + 5 * 60 * 1000),
        });
        const close = (id: string) =>
          forceCloseWindowInTx(tx, {
            windowId: id,
            adminId,
            reason: '영업 안 하는 시간',
            now: NOW,
          });

        expect(
          (await selectShopSlotControl(tx, shop.shopId, NOW))?.openWindows.map(
            (row) => row.windowId,
          ),
        ).toEqual([other, windowId]);

        const result = await close(windowId);
        expect(result).toMatchObject({ ok: true, data: { windowId, closedAt: NOW } });
        expect(result.ok && result.data.keptSlots.map((slot) => slot.slotId)).toEqual([kept]);
        const [row] = await tx
          .select({ status: slotWindows.status, closeReason: slotWindows.closeReason })
          .from(slotWindows)
          .where(eq(slotWindows.id, windowId));
        expect(row).toEqual({ status: 'closed', closeReason: 'admin' });
        expect(
          (await selectShopSlotControl(tx, shop.shopId, NOW))?.openWindows.map(
            (open) => open.windowId,
          ),
        ).toEqual([other]);

        expect(await close(windowId)).toMatchObject({ error: { code: 'WINDOW_CLOSED' } });
        expect(await close(crypto.randomUUID())).toMatchObject({
          error: { code: 'WINDOW_NOT_FOUND' },
        });
        expect(await actionsOn(tx, windowId)).toEqual([
          {
            adminId,
            action: 'slot.force_close',
            targetType: 'slot_window',
            memo: '영업 안 하는 시간',
          },
        ]);
      });
    });
  });
});
