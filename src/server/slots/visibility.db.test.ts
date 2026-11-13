// 원장님 화면·운영자 목록에 보일 매물 조건(ownerListedSlot, #308 ③)을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.

import { and, eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { slots, slotWindows } from '@/db/schema';

import { createTestShop, testSlot } from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../tests/db/test-db';
import { ownerListedSlot } from './visibility';

describeDb('원장님 화면에 보일 매물 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('원장님이 올린 매물과 결제가 끝난 시간대 칸만 보이고, 결제 중인 시간대 칸과 결제 없이 비운 칸은 빠진다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const [window] = await tx
        .insert(slotWindows)
        .values({
          shopId: shop.shopId,
          startAt: new Date('2026-11-01T13:00:00+09:00'),
          endAt: new Date('2026-11-01T18:00:00+09:00'),
          publishAt: new Date('2026-10-30T10:00:00+09:00'),
          status: 'published',
          createdBy: shop.createdBy,
        })
        .returning({ id: slotWindows.id });
      const closed = { status: 'closed' as const, closedAt: new Date('2026-10-31T10:00:00+09:00') };
      const rows = await tx
        .insert(slots)
        .values([
          // 원장님이 올린 한 시술 매물: 게시중, 다른 사유로 마감
          testSlot(shop, '09:00', '10:00'),
          testSlot(shop, '10:00', '11:00', { ...closed, closeReason: 'mistake' }),
          // 시간대 안: 결제 중, 결제 없이 비움, 결제 끝남(예약됨)
          testSlot(shop, '13:00', '14:00', { windowId: window.id }),
          testSlot(shop, '14:00', '15:00', {
            ...closed,
            windowId: window.id,
            closeReason: 'hold_released',
          }),
          testSlot(shop, '15:00', '16:00', { windowId: window.id, status: 'reserved' }),
        ])
        .returning({ id: slots.id });
      const [published, mistake, , , reserved] = rows.map((row) => row.id);

      const listed = await tx
        .select({ id: slots.id })
        .from(slots)
        .where(and(eq(slots.shopId, shop.shopId), ownerListedSlot()));
      expect(listed.map((row) => row.id).sort()).toEqual([published, mistake, reserved].sort());
    });
  });
});
