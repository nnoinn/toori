// 신규 고객 판별 (#49). 이력 기준(확정·이용 완료(노쇼 포함)만, 취소 제외)과 목록 조건을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.

import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { customers, profiles, slots } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  createTestUser,
  testSlot,
  type TestShop,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import { getVisitedShopIds, isNewCustomer, newCustomerOnlyVisible } from './new-customer';

let seq = 0;

/** 같은 샵 매물끼리 시간이 겹치지 않게(slots_no_overlap) 매번 다른 정시 1시간 칸의 'HH:MM' 시작·끝을 준다(30분 단위, #108) */
function nextWindow(): [string, string] {
  seq += 1;
  const hour = seq % 23;
  const hm = (h: number) => `${String(h).padStart(2, '0')}:00`;
  return [hm(hour), hm(hour + 1)];
}

/** 게시중인 매물 하나(일반 또는 신규 고객 전용) */
async function createListedSlot(tx: TestTx, shop: TestShop, newCustomerOnly: boolean) {
  const [start, end] = nextWindow();
  const [slot] = await tx
    .insert(slots)
    .values(testSlot(shop, start, end, { newCustomerOnly }))
    .returning({ id: slots.id });
  return slot.id;
}

/** 목록 조건을 넣었을 때 보이는 매물 id */
/** 같은 로그인에 고객 계정을 하나 더 만든다(앞 계정은 탈퇴한 것으로 둔다) */
async function rejoinSameLogin(tx: TestTx, previous: { userId: string; customerId: string }) {
  await tx
    .update(customers)
    .set({ withdrawnAt: new Date('2026-09-01T10:00:00+09:00') })
    .where(eq(customers.id, previous.customerId));
  const [row] = await tx
    .insert(customers)
    .values({ userId: previous.userId, name: '다시 온 고객', nickname: '고객' })
    .returning({ id: customers.id });
  return row.id;
}

/** 다른 로그인(새 로그인 정보)의 고객 계정. identityHash를 주면 그 같은 사람 표시를 넣는다 */
async function customerWithIdentity(tx: TestTx, identityHash: string | null) {
  const userId = await createTestUser(tx);
  await tx.update(profiles).set({ identityHash }).where(eq(profiles.id, userId));
  const [row] = await tx
    .insert(customers)
    .values({ userId, name: '고객', nickname: '고객' })
    .returning({ id: customers.id });
  return { userId, customerId: row.id };
}

async function visibleSlotIds(tx: TestTx, customerId: string | null, slotIds: string[]) {
  const rows = await tx
    .select({ id: slots.id })
    .from(slots)
    .where(and(newCustomerOnlyVisible(customerId), inArray(slots.id, slotIds)));
  return new Set(rows.map((row) => row.id));
}

describeDb('신규 고객 판별 (실제 DB)', () => {
  afterAll(closeTestDb);

  it.each([
    { history: '이력 없음', status: null, visitResult: null, isNew: true },
    { history: '확정', status: 'confirmed', visitResult: null, isNew: false },
    { history: '이용 완료', status: 'completed', visitResult: 'visited', isNew: false },
    { history: '노쇼', status: 'completed', visitResult: 'no_show', isNew: false },
    { history: '취소만 있음', status: 'cancelled', visitResult: null, isNew: true },
  ] as const)('$history → 신규 고객 $isNew', async ({ status, visitResult, isNew }) => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      if (status) {
        await createTestReservation(tx, shop, customerId, ...nextWindow(), status, { visitResult });
      }

      expect(await isNewCustomer(customerId, shop.shopId, tx)).toBe(isNew);

      // 목록: 일반 매물은 늘 보이고, 신규 고객 전용은 신규일 때만 보인다
      const normal = await createListedSlot(tx, shop, false);
      const newOnly = await createListedSlot(tx, shop, true);
      const visible = await visibleSlotIds(tx, customerId, [normal, newOnly]);
      expect(visible.has(normal)).toBe(true);
      expect(visible.has(newOnly)).toBe(isNew);
    });
  });

  it('다른 샵 이력이나 다른 고객의 이력은 상관없다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const otherShop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const other = await createTestCustomer(tx);
      await createTestReservation(tx, otherShop, customerId, ...nextWindow(), 'completed', {
        visitResult: 'visited',
      });
      await createTestReservation(tx, shop, other.customerId, ...nextWindow(), 'completed', {
        visitResult: 'visited',
      });

      expect(await isNewCustomer(customerId, shop.shopId, tx)).toBe(true);
      const newOnly = await createListedSlot(tx, shop, true);
      expect(await visibleSlotIds(tx, customerId, [newOnly])).toEqual(new Set([newOnly]));
    });
  });

  it('같은 로그인의 탈퇴한 고객 계정 이력도 이력으로 본다(#154, 30일 뒤 다시 가입)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const before = await createTestCustomer(tx);
      await createTestReservation(tx, shop, before.customerId, ...nextWindow(), 'completed', {
        visitResult: 'visited',
      });
      const again = await rejoinSameLogin(tx, before);

      expect(await isNewCustomer(again, shop.shopId, tx)).toBe(false);
      expect(await getVisitedShopIds(again, [shop.shopId], tx)).toEqual(new Set([shop.shopId]));
      const newOnly = await createListedSlot(tx, shop, true);
      expect(await visibleSlotIds(tx, again, [newOnly])).toEqual(new Set());
    });
  });

  it('로그인 정보까지 지운 뒤 같은 이메일로 다시 가입한 계정은 같은 사람 표시로 예전 이력을 잇는다(#154)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const before = await customerWithIdentity(tx, 'same-person');
      await createTestReservation(tx, shop, before.customerId, ...nextWindow(), 'confirmed');
      const again = await customerWithIdentity(tx, 'same-person');
      const stranger = await customerWithIdentity(tx, 'other-person');

      expect(await isNewCustomer(again.customerId, shop.shopId, tx)).toBe(false);
      expect(await isNewCustomer(stranger.customerId, shop.shopId, tx)).toBe(true);
      const newOnly = await createListedSlot(tx, shop, true);
      expect(await visibleSlotIds(tx, again.customerId, [newOnly])).toEqual(new Set());
      expect(await visibleSlotIds(tx, stranger.customerId, [newOnly])).toEqual(new Set([newOnly]));
    });
  });

  it('같은 사람 표시가 둘 다 비어 있으면 같은 사람으로 보지 않는다(키가 없던 환경). 취소만 있는 예전 계정도 이력이 아니다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const before = await customerWithIdentity(tx, null);
      await createTestReservation(tx, shop, before.customerId, ...nextWindow(), 'confirmed');
      const unknown = await customerWithIdentity(tx, null);
      expect(await isNewCustomer(unknown.customerId, shop.shopId, tx)).toBe(true);

      const cancelledBefore = await customerWithIdentity(tx, 'cancel-only');
      await createTestReservation(
        tx,
        shop,
        cancelledBefore.customerId,
        ...nextWindow(),
        'cancelled',
      );
      const cancelledAgain = await customerWithIdentity(tx, 'cancel-only');
      expect(await isNewCustomer(cancelledAgain.customerId, shop.shopId, tx)).toBe(true);
    });
  });

  it('로그인 안 함(null)이면 이력과 상관없이 신규 고객 전용 매물도 모두 보인다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      await createTestReservation(tx, shop, customerId, ...nextWindow(), 'completed', {
        visitResult: 'visited',
      });
      const newOnly = await createListedSlot(tx, shop, true);

      expect(await visibleSlotIds(tx, null, [newOnly])).toEqual(new Set([newOnly]));
      expect(await visibleSlotIds(tx, customerId, [newOnly])).toEqual(new Set());
    });
  });

  it('getVisitedShopIds는 여러 샵 중 이력이 있는 샵만 한 번에 돌려준다', async () => {
    await withRollback(async (tx) => {
      const visited = await createTestShop(tx, { status: 'approved' });
      const cancelledOnly = await createTestShop(tx, { status: 'approved' });
      const untouched = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      await createTestReservation(tx, visited, customerId, ...nextWindow(), 'completed', {
        visitResult: 'visited',
      });
      await createTestReservation(tx, visited, customerId, ...nextWindow(), 'confirmed');
      await createTestReservation(tx, cancelledOnly, customerId, ...nextWindow(), 'cancelled');

      const shopIds = [visited.shopId, cancelledOnly.shopId, untouched.shopId, visited.shopId];
      expect(await getVisitedShopIds(customerId, shopIds, tx)).toEqual(new Set([visited.shopId]));
      expect(await getVisitedShopIds(customerId, [], tx)).toEqual(new Set());
    });
  });
});
