// 예약·결제 DB 읽기(readCheckoutSlot, readCustomerPhone)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { customers, slots } from '@/db/schema';

import { createTestCustomer, createTestShop, testSlot } from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../tests/db/test-db';
import { readCheckoutSlot, readCustomerPhone } from './checkout-store';

describeDb('예약·결제 DB 읽기 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('승인된 샵의 매물은 샵 이름·판매가·홀딩 칸까지 읽는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const [slot] = await tx
        .insert(slots)
        .values(testSlot(shop, '10:00', '11:00'))
        .returning();
      expect(await readCheckoutSlot(slot.id, tx)).toEqual({
        slotId: slot.id,
        shopId: shop.shopId,
        shopName: '테스트 미용실',
        menuName: '커트',
        status: 'published',
        publishAt: slot.publishAt,
        startAt: slot.startAt,
        salePrice: 14000,
        newCustomerOnly: false,
        holdCustomerId: null,
        holdExpiresAt: null,
      });
    });
  });

  it('승인 대기·반려 샵의 매물과 없는 매물은 null', async () => {
    await withRollback(async (tx) => {
      for (const status of ['pending', 'rejected'] as const) {
        const shop = await createTestShop(tx, { status });
        const [slot] = await tx
          .insert(slots)
          .values(testSlot(shop, '10:00', '11:00'))
          .returning();
        expect(await readCheckoutSlot(slot.id, tx)).toBeNull();
      }
      expect(await readCheckoutSlot(crypto.randomUUID(), tx)).toBeNull();
    });
  });

  it('고객 연락처가 없으면 null, 있으면 그 번호', async () => {
    await withRollback(async (tx) => {
      const { customerId } = await createTestCustomer(tx);
      expect(await readCustomerPhone(customerId, tx)).toBeNull();
      await tx
        .update(customers)
        .set({ phone: '010-0000-0000' })
        .where(eq(customers.id, customerId));
      expect(await readCustomerPhone(customerId, tx)).toBe('010-0000-0000');
    });
  });
});
