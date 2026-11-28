// 관심 매물과 첫 로그인 안내(마이그레이션 0024, #616)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// - 관심 매물은 한 시술 매물이나 시간대 중 하나에만 표시하고, 같은 고객은 같은 대상에 한 번만 표시한다(C-211)
// - 고객 계정의 첫 로그인 안내 시각은 처음에는 비어 있다(C-107, 비어 있으면 안내를 보여 준다)

import { DrizzleQueryError, eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { customers, slotInterests, slots, slotWindows } from '@/db/schema';

import {
  createTestCustomer,
  createTestShop,
  type TestShop,
  testSlot,
} from '../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../tests/db/test-db';

const at = (hm: string) => new Date(`2026-11-01T${hm}:00+09:00`);

/** savepoint 안에서 돌려 실패한 DB 오류를 돌려준다. 성공하면 undefined */
async function failure(tx: TestTx, run: (t: TestTx) => Promise<unknown>): Promise<unknown> {
  try {
    await tx.transaction(async (t) => {
      await run(t);
    });
  } catch (error) {
    return error instanceof DrizzleQueryError ? error.cause : error;
  }
  return undefined;
}

/** 게시중 한 시술 매물 하나와 게시중 시간대 하나(시간이 겹치지 않는다) */
async function slotAndWindow(tx: TestTx, shop: TestShop) {
  const [slot] = await tx
    .insert(slots)
    .values(testSlot(shop, '10:00', '11:00'))
    .returning({ id: slots.id });
  const [window] = await tx
    .insert(slotWindows)
    .values({
      shopId: shop.shopId,
      startAt: at('14:00'),
      endAt: at('17:00'),
      publishAt: new Date('2026-10-30T10:00:00+09:00'),
      status: 'published',
      createdBy: shop.createdBy,
    })
    .returning({ id: slotWindows.id });
  return { slotId: slot.id, windowId: window.id };
}

describeDb('관심 매물·첫 로그인 안내 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('관심 매물은 한 시술 매물이나 시간대 중 하나에만 표시한다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const { slotId, windowId } = await slotAndWindow(tx, shop);

      const targetCheck = { code: '23514', constraint_name: 'slot_interests_target_check' };
      expect(
        await failure(tx, (t) => t.insert(slotInterests).values({ customerId })),
      ).toMatchObject(targetCheck);
      expect(
        await failure(tx, (t) => t.insert(slotInterests).values({ customerId, slotId, windowId })),
      ).toMatchObject(targetCheck);

      await tx.insert(slotInterests).values([
        { customerId, slotId },
        { customerId, windowId },
      ]);
      const rows = await tx
        .select({ slotId: slotInterests.slotId, windowId: slotInterests.windowId })
        .from(slotInterests)
        .where(eq(slotInterests.customerId, customerId));
      expect(rows).toHaveLength(2);
      expect(rows).toEqual(
        expect.arrayContaining([
          { slotId, windowId: null },
          { slotId: null, windowId },
        ]),
      );
    });
  });

  it('같은 고객은 같은 매물·시간대에 한 번만 표시하고, 다른 고객은 같은 매물에 표시할 수 있다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const other = await createTestCustomer(tx);
      const { slotId, windowId } = await slotAndWindow(tx, shop);
      await tx.insert(slotInterests).values([
        { customerId, slotId },
        { customerId, windowId },
      ]);

      expect(
        await failure(tx, (t) => t.insert(slotInterests).values({ customerId, slotId })),
      ).toMatchObject({ code: '23505', constraint_name: 'slot_interests_customer_slot_unique' });
      expect(
        await failure(tx, (t) => t.insert(slotInterests).values({ customerId, windowId })),
      ).toMatchObject({ code: '23505', constraint_name: 'slot_interests_customer_window_unique' });

      // 화면이 [관심]을 두 번 눌러도 그대로 두는 저장(onConflictDoNothing)이 이 unique를 쓴다
      await tx
        .insert(slotInterests)
        .values({ customerId, slotId })
        .onConflictDoNothing({ target: [slotInterests.customerId, slotInterests.slotId] });
      await tx.insert(slotInterests).values([
        { customerId: other.customerId, slotId },
        { customerId: other.customerId, windowId },
      ]);
      const counts = await tx
        .select({ customerId: slotInterests.customerId })
        .from(slotInterests)
        .where(eq(slotInterests.slotId, slotId));
      expect(counts.map((row) => row.customerId).sort()).toEqual(
        [customerId, other.customerId].sort(),
      );
    });
  });

  it('고객 계정의 첫 로그인 안내 시각은 처음에는 비어 있고, 본 시각을 남길 수 있다', async () => {
    await withRollback(async (tx) => {
      const { customerId } = await createTestCustomer(tx);
      const seenAt = at('09:30');
      const read = async () => {
        const [row] = await tx
          .select({ onboardingSeenAt: customers.onboardingSeenAt })
          .from(customers)
          .where(eq(customers.id, customerId));
        return row.onboardingSeenAt;
      };

      expect(await read()).toBeNull();
      await tx
        .update(customers)
        .set({ onboardingSeenAt: seenAt })
        .where(eq(customers.id, customerId));
      expect(await read()).toEqual(seenAt);
    });
  });
});
