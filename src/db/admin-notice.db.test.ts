// 원장님에게 보여 줄 운영자 사유 코드 DB 구조 (마이그레이션 0021, #489). 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// - settlement_holds.reason_code: 필수, 정산 보류 목록의 코드만
// - shops.publish_paused_code: 멈춘 시각·사유와 같이 채우고 같이 비움, 게시 멈춤 목록의 코드만
// - slots·slot_windows.admin_close_code: 운영자 마감(close_reason admin)일 때만, 그때는 꼭 채움, 운영자 마감 목록의 코드만
// Postgres는 check를 이름 순으로 보므로, 한 번에 한 조건만 어기게 값을 고른다

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { settlementHolds, shops, slots, slotWindows } from '@/db/schema';

import { createTestShop, createTestUser, testSlot } from '../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../tests/db/test-db';

/** savepoint 안에서 돌려 막혔으면 제약 이름이 든 오류 문구, 통과했으면 null. 바깥 트랜잭션은 계속 쓸 수 있다 */
async function blockedMessage(tx: TestTx, run: (t: TestTx) => Promise<unknown>) {
  try {
    await tx.transaction(async (t) => {
      await run(t);
    });
    return null;
  } catch (error) {
    const cause = (error as { cause?: unknown }).cause ?? error;
    const { message, constraint_name: constraint } = cause as {
      message?: string;
      constraint_name?: string;
    };
    return `${constraint ?? ''} ${message ?? String(cause)}`;
  }
}

const AT = new Date('2026-11-18T10:00:00+09:00');

describeDb('운영자 사유 코드 DB 구조 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('정산 보류: 사유 코드는 필수이고 정산 보류 목록의 코드만 받는다', async () => {
    await withRollback(async (tx) => {
      const adminId = await createTestUser(tx);
      const shop = await createTestShop(tx, { status: 'approved' });
      // 풀린 보류로 넣는다(풀리지 않은 보류는 샵마다 하나라서, 통과한 줄끼리 막히지 않게)
      const base = {
        shopId: shop.shopId,
        reason: '확인',
        heldBy: adminId,
        heldAt: AT,
        releasedBy: adminId,
        releasedAt: AT,
        releaseMemo: '확인함',
      };
      const insert = (reasonCode: string | null) =>
        blockedMessage(tx, (t) =>
          t.insert(settlementHolds).values({ ...base, reasonCode: reasonCode as string }),
        );

      expect(await insert(null)).toContain('reason_code');
      // 운영자 마감·게시 멈춤에만 있는 코드와 모르는 코드는 막는다
      expect(await insert('listing_mismatch')).toContain('settlement_holds_reason_code_check');
      expect(await insert('shop_info_check')).toContain('settlement_holds_reason_code_check');
      expect(await insert('deleted')).toContain('settlement_holds_reason_code_check');
      for (const code of [
        'user_inquiry',
        'payment_check',
        'payout_info_check',
        'owner_request',
        'other',
      ]) {
        expect(await insert(code)).toBeNull();
      }
    });
  });

  it('게시 멈춤: 사유 코드는 멈춘 시각·사유와 같이 채우고 같이 비우며, 게시 멈춤 목록의 코드만 받는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const pause = (values: Partial<typeof shops.$inferInsert>) =>
        blockedMessage(tx, (t) => t.update(shops).set(values).where(eq(shops.id, shop.shopId)));
      const paused = { publishPausedAt: AT, publishPausedReason: '신고 확인 중' };

      expect(await pause(paused)).toContain('shops_publish_pause_check');
      expect(await pause({ publishPausedCode: 'other' })).toContain('shops_publish_pause_check');
      expect(await pause({ ...paused, publishPausedCode: 'payment_check' })).toContain(
        'shops_publish_paused_code_check',
      );
      for (const code of ['user_inquiry', 'shop_info_check', 'owner_request', 'other']) {
        expect(await pause({ ...paused, publishPausedCode: code })).toBeNull();
      }
      expect(
        await pause({ publishPausedAt: null, publishPausedReason: null, publishPausedCode: null }),
      ).toBeNull();
    });
  });

  it('운영자 마감 코드: 매물·시간대 매물 모두 운영자 마감(admin)일 때만, 그때는 꼭 채우고, 운영자 마감 목록의 코드만 받는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const [slot] = await tx
        .insert(slots)
        .values(testSlot(shop, '09:00', '10:00'))
        .returning({ id: slots.id });
      const [window] = await tx
        .insert(slotWindows)
        .values({
          shopId: shop.shopId,
          startAt: new Date('2026-11-20T13:00:00+09:00'),
          endAt: new Date('2026-11-20T15:00:00+09:00'),
          publishAt: new Date('2026-11-18T13:00:00+09:00'),
          status: 'published',
          createdBy: shop.createdBy,
        })
        .returning({ id: slotWindows.id });
      const cases = [
        {
          name: 'slots',
          close: (values: Partial<typeof slots.$inferInsert>) =>
            blockedMessage(tx, (t) => t.update(slots).set(values).where(eq(slots.id, slot.id))),
        },
        {
          name: 'slot_windows',
          close: (values: Partial<typeof slotWindows.$inferInsert>) =>
            blockedMessage(tx, (t) =>
              t.update(slotWindows).set(values).where(eq(slotWindows.id, window.id)),
            ),
        },
      ];

      for (const { name, close } of cases) {
        const check = `${name}_admin_close_code_check`;
        const closed = { status: 'closed', closedAt: AT } as const;
        // 운영자 마감인데 코드가 없음, 원장님 마감인데 코드가 있음, 마감 전인데 코드가 있음
        expect(await close({ ...closed, closeReason: 'admin', adminCloseCode: null })).toContain(
          check,
        );
        expect(
          await close({ ...closed, closeReason: 'mistake', adminCloseCode: 'other' }),
        ).toContain(check);
        expect(await close({ adminCloseCode: 'other' })).toContain(check);
        // 게시 멈춤·정산 보류에만 있는 코드는 막는다
        expect(
          await close({ ...closed, closeReason: 'admin', adminCloseCode: 'payment_check' }),
        ).toContain(check);
        for (const code of ['listing_mismatch', 'user_inquiry', 'owner_request', 'other']) {
          expect(await close({ ...closed, closeReason: 'admin', adminCloseCode: code })).toBeNull();
        }
        expect(await close({ ...closed, closeReason: 'mistake', adminCloseCode: null })).toBeNull();
      }
    });
  });
});
