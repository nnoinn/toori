// DB 조건(slot-status-sql.ts)이 순수 함수(slot-status.ts)와 같은 답을 내는지 실제 Postgres에서 확인한다 (#57 4장).
// TEST_DATABASE_URL이 없으면 건너뛴다(CI에서는 늘 돈다). 쓰는 법은 docs/tech-guide.md 3-4 "DB 테스트".

import { and, eq, not } from 'drizzle-orm';
import { authUsers } from 'drizzle-orm/supabase';
import { afterAll, expect, it } from 'vitest';

import { customers, menus, owners, profiles, shops, slots } from '@/db/schema';

import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import {
  isSlotOnHold,
  SLOT_STATUS_LABELS,
  type SlotHoldInput,
  type SlotStatus,
} from './slot-status';
import { SLOT_STATUS_CASES } from './slot-status-cases';
import { slotIsOnHold, slotStatusIs } from './slot-status-sql';

afterAll(closeTestDb);

const STATUSES = Object.keys(SLOT_STATUS_LABELS) as SlotStatus[];

async function createUser(tx: TestTx) {
  const userId = crypto.randomUUID();
  await tx.insert(authUsers).values({ id: userId });
  await tx.insert(profiles).values({ id: userId, email: `${userId}@test.invalid` });
  return userId;
}

/** 원장님 계정 → 샵 → 메뉴를 만들고 매물에 필요한 값을 돌려준다 */
async function createShop(tx: TestTx) {
  const userId = await createUser(tx);
  const [owner] = await tx
    .insert(owners)
    .values({ userId, name: '테스트 원장', phone: '000-0000-0000' })
    .returning();
  const [shop] = await tx
    .insert(shops)
    .values({
      ownerId: owner.id,
      name: '테스트 미용실',
      category: 'hair',
      phone: '000-0000-0000',
      roadAddress: '경기도 안산시 단원구 테스트로 1',
      sido: '경기도',
      sigungu: '안산시 단원구',
      sigunguCode: '41273',
      location: { lng: 126.8308, lat: 37.3219 },
      businessName: '테스트 미용실',
      representativeName: '테스트 원장',
      businessRegistrationNumber: '000-00-00000',
      openedOn: '2026-01-01',
      businessDocPath: 'test/business-doc.pdf',
    })
    .returning();
  const [menu] = await tx
    .insert(menus)
    .values({
      shopId: shop.id,
      serviceType: 'cut',
      name: '커트',
      listPrice: 20000,
      durationMinutes: 60,
      sortOrder: 0,
    })
    .returning();
  return { shopId: shop.id, menuId: menu.id, createdBy: userId };
}

async function insertSlot(
  tx: TestTx,
  values: Pick<typeof slots.$inferInsert, 'status' | 'publishAt' | 'startAt'> &
    Partial<typeof slots.$inferInsert>,
) {
  const ids = await createShop(tx);
  const [row] = await tx
    .insert(slots)
    .values({
      ...ids,
      serviceType: 'cut',
      menuName: '커트',
      listPrice: 20000,
      durationMinutes: 60,
      discountRate: 30,
      salePrice: 14000,
      endAt: new Date(values.startAt.getTime() + 60 * 60 * 1000),
      ...values,
    })
    .returning();
  return row.id;
}

describeDb('slotStatusIs (실제 DB)', () => {
  it.each(SLOT_STATUS_CASES)('$name', async ({ slot, now, expected }) => {
    await withRollback(async (tx) => {
      const id = await insertSlot(tx, slot);
      const matched: SlotStatus[] = [];
      for (const status of STATUSES) {
        const rows = await tx
          .select({ id: slots.id })
          .from(slots)
          .where(and(eq(slots.id, id), slotStatusIs(status, now)));
        if (rows.length > 0) matched.push(status);
      }
      // 6개 조건 중 순수 함수가 고른 상태 하나에만 걸린다
      expect(matched).toEqual([expected]);
    });
  });
});

describeDb('slotIsOnHold (실제 DB)', () => {
  const now = new Date('2026-10-31T12:00:00+09:00');
  const cases: { name: string; hold: (customerId: string) => SlotHoldInput }[] = [
    { name: '홀딩 없음', hold: () => ({ holdCustomerId: null, holdExpiresAt: null }) },
    {
      name: '만료 전',
      hold: (id) => ({ holdCustomerId: id, holdExpiresAt: new Date(now.getTime() + 1) }),
    },
    { name: '만료 시각과 같음', hold: (id) => ({ holdCustomerId: id, holdExpiresAt: now }) },
    {
      name: '만료됨',
      hold: (id) => ({ holdCustomerId: id, holdExpiresAt: new Date(now.getTime() - 1) }),
    },
    {
      name: '고객만 있고 만료 시각 없음',
      hold: (id) => ({ holdCustomerId: id, holdExpiresAt: null }),
    },
  ];

  it.each(cases)('$name: 순수 함수와 같은 답을 내고 not()으로 뒤집을 수 있다', async ({ hold }) => {
    await withRollback(async (tx) => {
      const userId = await createUser(tx);
      const [customer] = await tx
        .insert(customers)
        .values({ userId, nickname: '테스트 고객' })
        .returning();
      const holdInput = hold(customer.id);
      const id = await insertSlot(tx, {
        status: 'published',
        publishAt: new Date('2026-10-30T12:00:00+09:00'),
        startAt: new Date('2026-11-01T12:00:00+09:00'),
        ...holdInput,
      });
      const count = async (condition: ReturnType<typeof slotIsOnHold>) =>
        (
          await tx
            .select({ id: slots.id })
            .from(slots)
            .where(and(eq(slots.id, id), condition))
        ).length;

      const expected = isSlotOnHold(holdInput, now);
      expect(await count(slotIsOnHold(now))).toBe(expected ? 1 : 0);
      expect(await count(not(slotIsOnHold(now)))).toBe(expected ? 0 : 1);
    });
  });
});
